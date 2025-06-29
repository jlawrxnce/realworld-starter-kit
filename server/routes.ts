import { Account, Article, Comment, Favorite, Follower, Jwt, Map, Merge, Profile, Tag, Membership, Paywall, View, Revenue, Subscription } from "./app";
import { Router, getExpressRouter } from "./framework/router";
import { ObjectId } from "mongodb";
import { ArticleRequest, CommentRequest, UserRequest, UserResponse, MembershipRequest } from "types/types";
import { NotAllowedError, NotFoundError, UnprocessableEntityError } from "./concepts/errors";
import { Tier } from "./concepts/membership";

const EMPTY_ARTICLE = {
  article: {
    slug: "",
    title: "",
    description: "",
    body: "",
    tagList: [],
    createdAt: new Date("0").toISOString(),
    updatedAt: new Date("0").toISOString(),
    favorited: false,
    favoritesCount: 0,
    author: { username: "", bio: "", image: "", following: "" },
  },
};

const EMPTY_PROFILE = { profile: { username: "", bio: "", image: "", following: false, hasPaywall: false } };
const EMPTY_USER = { user: { username: "", bio: "", image: "", email: "", token: "" } };
const EMPTY_COMMENT = { comment: { id: 0, body: "", createdAt: new Date("01").toISOString(), updatedAt: new Date("01").toISOString(), author: EMPTY_PROFILE.profile } };
const EMPTY_MEMBERSHIP = { membership: { username: "", tier: Tier.Free, renewalDate: new Date().toISOString(), autoRenew: false, totalRevenue: 0, totalViews: null } };

class Routes {
  @Router.post("/membership")
  async activateMembership(membership: MembershipRequest, auth: string) {
    const userId = await Jwt.authenticate(auth);
    if (membership.tier === Tier.Free) {
      throw new UnprocessableEntityError("Cannot activate Free tier membership");
    }
    const newMembership = await Membership.create(userId, membership.tier as Tier);
    
    // Create a subscription for the membership
    const duration = membership.tier === Tier.Trial ? 7 : 30; // 7 days for Trial, 30 for Gold
    await Subscription.create(userId, new Date(), duration);
    
    const account = await Account.getAccountById(userId);
    const totalRevenue = await Revenue.getTotalRevenue(userId);
    const totalViews = await View.getTotalArticleViewsForAuthor(userId);
    
    return Merge.createTransformedResponse(
      "membership",
      (merged) => ({
        ...merged,
        username: account.username,
        totalRevenue,
        totalViews: newMembership && newMembership.tier === Tier.Free ? null : totalViews,
      }),
      EMPTY_MEMBERSHIP.membership,
      newMembership ?? {}
    );
  }

  @Router.put("/membership")
  async updateMembership(membership: Partial<MembershipRequest>, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const currentMembership = await Membership.getMembership(userId);
    
    if (currentMembership.tier === Tier.Free) {
      throw new NotAllowedError("Free users cannot update membership");
    }
    
    // Gold users cannot downgrade to Trial (handled in Membership concept)
    if (currentMembership.tier === Tier.Gold && membership.tier === Tier.Trial) {
      throw new UnprocessableEntityError("Gold members cannot downgrade to Trial tier");
    }
    
    const updatedMembership = await Membership.update(userId, membership);
    const totalRevenue = await Revenue.getTotalRevenue(userId);
    const totalViews = await View.getTotalArticleViewsForAuthor(userId);
    const account = await Account.getAccountById(userId);
    
    return Merge.createTransformedResponse(
      "membership",
      (merged) => ({
        ...merged,
        totalRevenue,
        totalViews: updatedMembership && updatedMembership.tier === Tier.Free ? null : totalViews,
        username: account.username,
      }),
      EMPTY_MEMBERSHIP.membership,
      updatedMembership ?? {}
    );
  }
  
  @Router.put("/membership/renew")
  async renewMembership(auth: string) {
    const userId = await Jwt.authenticate(auth);
    // Use Subscription concept to handle the renewal process
    const currentMembership = await Membership.getMembership(userId);
    
    // Create or renew the subscription
    if (currentMembership.tier === Tier.Free) {
      throw new NotAllowedError("Free users cannot renew membership");
    } else if (currentMembership.tier === Tier.Trial) {
      // Trial users upgrading to Gold
      await Subscription.create(userId, new Date(), 30); // 30 days for Gold
    } else {
      // Gold users renewing
      await Subscription.renew(userId, 30); // Extend by 30 days
    }
    
    const updatedMembership = await Membership.renew(userId);
    const totalRevenue = await Revenue.getTotalRevenue(userId);
    const totalViews = await View.getTotalArticleViewsForAuthor(userId);
    const account = await Account.getAccountById(userId);
    
    return Merge.createTransformedResponse(
      "membership",
      (merged) => ({
        ...merged,
        totalRevenue,
        totalViews: updatedMembership && updatedMembership.tier === Tier.Free ? null : totalViews,
        username: account.username,
      }),
      EMPTY_MEMBERSHIP.membership,
      updatedMembership ?? {}
    );
  }

  @Router.get("/membership")
  async getMembership(auth: string) {
    const userId = await Jwt.authenticate(auth);
    const membership = await Membership.getMembership(userId);
    const account = await Account.getAccountById(userId);
    const totalRevenue = await Revenue.getTotalRevenue(userId);
    const totalViews = await View.getTotalArticleViewsForAuthor(userId);

    return Merge.createTransformedResponse(
      "membership",
      (merged) => ({
        ...merged,
        totalRevenue,
        totalViews: membership.tier === Tier.Free ? null : totalViews,
        username: account.username,
      }),
      EMPTY_MEMBERSHIP.membership,
      membership ?? {}
    );
  }

  @Router.put("/articles/:slug/view")
  async viewArticle(slug: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlug(slug);
    if (!article) {
      throw new NotFoundError(`Article ${slug} not found!`);
    }

    const hasPaywall = await Paywall.hasPaywall(article._id);
    if (hasPaywall) {
      const viewerMembership = await Membership.getMembership(userId);
      if (viewerMembership.tier === Tier.Free) {
        throw new NotAllowedError("Free users cannot view paywalled articles");
      }

      // Record view and revenue if viewer is not the author
      // Always track the view for article statistics
      await View.create(userId, article._id, article.author, true);
      
      // Only generate revenue if the author has Gold or Trial membership
      const authorMembership = await Membership.getMembership(article.author);
      if (authorMembership.tier === Tier.Gold || authorMembership.tier === Tier.Trial) {
        await Revenue.create(article.author, article._id, authorMembership.tier);
      }
    } else {
      // For non-paywalled articles, still track the view but don't generate revenue
      await View.create(userId, article._id, article.author, true);
    }

    const profile = await Profile.getProfileById(article.author);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
    const favorited = await Favorite.isFavoritedByUser(article._id, userId);
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const following = await Follower.isFollowing(userId, article.author);
    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall }), EMPTY_ARTICLE.article, article, profileMessage);
  }

  @Router.put("/articles/:slug/paywall")
  async togglePaywall(slug: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const membership = await Membership.getMembership(userId);
    
    // Only Gold or Trial members can toggle paywall
    if (membership.tier === Tier.Free) {
      throw new NotAllowedError("Only Gold or Trial members can toggle paywall");
    }
    
    const article = await Article.getBySlug(slug);
    if (!article) {
      throw new NotFoundError(`Article ${slug} not found!`);
    }
    
    if (article.author.toString() !== userId.toString()) {
      throw new NotAllowedError("Only the author can toggle paywall");
    }
    
    // Check if user is Trial tier and enforce the 3 paywall limit
    const isTrialUser = membership.tier === Tier.Trial;
    const paywall = await Paywall.toggle(article._id, userId, isTrialUser);
    if (!paywall) throw new NotFoundError("Failed to toggle paywall");

    const profile = await Profile.getProfileById(article.author);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
    const favorited = false;
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const hasPaywall = await Paywall.hasPaywall(article._id);
    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall }), EMPTY_ARTICLE.article, article, profileMessage);
  }

  @Router.post("/users")
  async register(user: UserRequest) {
    const account = await Account.create(user.username, user.password, user.email);
    const profile = await Profile.create(account._id, user.username, user.bio ?? "", user.image ?? "");
    const token = await Jwt.create(account._id);
    await Paywall.create(profile._id, account._id);
    await View.create(account._id, profile._id, profile._id, false);
    return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, { token });
  }

  @Router.post("/users/login")
  async login(user: UserRequest) {
    const _id = await Account.authenticate(user.email, user.password ?? "");
    const account = await Account.getAccountById(_id);
    const profile = await Profile.getProfileById(_id);
    const jwt = await Jwt.update(account._id, account.username);
    return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, { token: jwt });
  }

  @Router.get("/user")
  async getUser(auth: string) {
    const userId = await Jwt.authenticate(auth);
    const account = await Account.getAccountById(userId);
    const profile = await Profile.getProfileById(userId);
    return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, { token: auth });
  }

  @Router.put("/user")
  async updateUser(user: UserRequest, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const account = await Account.update(userId, { ...user });
    const profile = await Profile.update(userId, { ...user });
    // Remove hasPaywall check as it's not in UserRequest type
    // Handle paywall toggle through a separate endpoint
    return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, { token: auth });
  }

  @Router.get("/profiles/:username")
  async getProfile(username: string, auth?: string) {
    let userId = null;
    if (auth) {
      userId = await Jwt.authenticate(auth);
    }
    const profile = await Profile.getProfileByUsername(username);
    if (!profile) {
      throw new NotFoundError(`Profile ${username} not found!`);
    }
    const following = userId ? await Follower.isFollowing(userId, profile._id) : false;
    const hasPaywall = await Paywall.hasPaywall(profile._id);

    // If profile has paywall and viewer is not authenticated or is Free tier, return empty profile
    if (hasPaywall && (!userId || (await Membership.getMembership(userId)).tier === Tier.Free)) {
      throw new NotAllowedError("Free users cannot view paywalled profiles");
    }
    
    // Record profile view if user is authenticated
    if (userId) {
      await View.create(userId, profile._id, profile._id, false);
    }

    return Merge.createResponse("profile", EMPTY_PROFILE.profile, profile, { following, hasPaywall });
  }

  @Router.post("/profiles/:username/follow")
  async followProfile(username: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const profile = await Profile.getProfileByUsername(username);
    await Follower.create(userId, profile._id);
    const hasPaywall = await Paywall.hasPaywall(profile._id);
    if (hasPaywall) {
      const membership = await Membership.getMembership(userId);
      if (membership.tier === Tier.Free) {
        throw new NotAllowedError("Free users cannot follow paywalled profiles");
      }
    }
    return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
  }

  @Router.delete("/profiles/:username/follow")
  async unfollowProfile(username: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const profile = await Profile.getProfileByUsername(username);
    await Follower.delete(userId, profile._id);
    return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following: false }), EMPTY_PROFILE.profile, profile);
  }

  @Router.post("/articles")
  async createArticle(article: ArticleRequest, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const profile = await Profile.getProfileById(userId);
    const newArticle = await Article.create(userId, article.title, article.description, article.body);
    await Tag.create(newArticle._id, article.tagList ?? []);

    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true, favoritesCount: 0 }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse(
      "article",
      (merged) => ({ ...merged, tagList: article.tagList ?? [], favorited: false, favoritesCount: 0, hasPaywall: false }),
      EMPTY_ARTICLE.article,
      newArticle,
      profileMessage,
    );
  }

  @Router.put("/articles/:slug")
  async updateArticle(slug: string, article: ArticleRequest, auth: string) {
    const userId = await Jwt.authenticate(auth);

    const profile = await Profile.getProfileById(userId);
    const oldArticle = await Article.getBySlugOrThrow(slug);
    const newArticle = await Article.update(oldArticle._id, { title: article.title, description: article.description, body: article.body });
    const favoritesCount = await Favorite.countTargetFavorites(newArticle._id);
    await Tag.update(oldArticle._id, article.tagList ?? []);

    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true, favoritesCount: favoritesCount }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList: article.tagList ?? [], favorited: false, favoritesCount }), EMPTY_ARTICLE.article, newArticle, profileMessage);
  }

  @Router.get("/articles")
  async listArticles(tag: string, author: string, favorited: string, limit: number, offset: number, auth: string) {
    let userId: ObjectId | undefined;
    if (auth) {
      try {
        userId = await Jwt.authenticate(auth);
      } catch (e) {
        /* optional auth */
      }
    }
    if (!limit) limit = 20;
    if (!offset) offset = 0;

    let articles = await Article.getArticles();
    let authorId: ObjectId;
    let tagArticleIds: Set<string>;
    let favoriteIds: Set<string>;
    try {
      if (author) {
        authorId = (await Profile.getProfileByUsername(author))._id;
      }

      if (tag) {
        tagArticleIds = new Set((await Tag.getTagByContent(tag)).map((tag) => tag.target.toString()));
      }

      if (favorited) {
        favoriteIds = new Set((await Favorite.getFavorites({ userId })).map((favorite) => favorite.target.toString()));
      }
    } catch (e) {
      /* filter doesn't exist */
      return { articles: [], articlesCount: 0 };
    }
    // TODO: have to do manual filtering here
    articles = articles.filter((article) => {
      let filtered = true;
      if (author) filtered = filtered && article.author.equals(authorId);
      if (tag) filtered = filtered && tagArticleIds.has(article._id.toString());
      if (favorited) filtered = filtered && favoriteIds.has(article._id.toString());
      return filtered;
    });
    articles = articles.splice(offset, offset + limit);
    // Map articles to response format (e.g., ArticleMessage)
    const articleMessages = await Promise.all(
      articles.map(async (article) => {
        const profile = await Profile.getProfileById(article.author);
        const following = userId ? await Follower.isFollowing(userId, profile._id) : false;
        const favoritesCount = await Favorite.countTargetFavorites(article._id);
        const favorited = userId ? await Favorite.isFavoritedByUser(userId, article._id) : false;
        const tagList = await Tag.getTagByTarget(article._id).then(Tag.stringify);

        const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
        return Merge.mergeTransformedObject((merged) => ({ ...merged, tagList, favorited, favoritesCount }), EMPTY_ARTICLE.article, article, profileMessage);
      }),
    );
    return { articles: articleMessages, articlesCount: articleMessages.length };
  }

  @Router.get("/articles/feed")
  async getFeedArticles(limit: number, offset: number, auth: string) {
    const userId = await Jwt.authenticate(auth);

    // Get list of followed author IDs
    const followIds = await Follower.getFollowers(userId).then(Map.mapObjectIds);

    // Retrieve articles by followed authors, sorted by most recent first, with pagination
    const articles = await Article.getByAuthors(followIds, limit, offset);
    // Map articles to the desired message format
    const articleMessages = await Promise.all(
      articles.map(async (article) => {
        const profile = await Profile.getProfileById(article.author);
        const following = true; // The user is following the author by definition
        const favoritesCount = await Favorite.countTargetFavorites(article._id);
        const favorited = await Favorite.isFavoritedByUser(userId, article._id);
        const tagList = await Tag.getTagByTarget(article._id).then(Tag.stringify);

        const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
        return Merge.mergeTransformedObject((merged) => ({ ...merged, tagList, favorited, favoritesCount }), EMPTY_ARTICLE.article, article, profileMessage);
      }),
    );
    return { articles: articleMessages, articlesCount: articleMessages.length };
  }

  @Router.get("/articles/:slug")
  async getArticle(slug: string, auth: string) {
    let userId: ObjectId | undefined;
    if (auth) {
      try {
        userId = await Jwt.authenticate(auth);
      } catch {
        /* optional auth */
      }
    }
    const article = await Article.getBySlugOrThrow(slug);
    const profile = await Profile.getProfileById(article?.author);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
    const favorited = false;
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const hasPaywall = await Paywall.hasPaywall(article._id);

    if (hasPaywall) {
      if (!userId) {
        throw new NotAllowedError("Only Gold members can access paywalled articles");
      }
      const membership = await Membership.getMembership(userId);
      if (membership.tier !== Tier.Gold) {
        throw new NotAllowedError("Only Gold members can access paywalled articles");
      }
    }

    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall }), EMPTY_ARTICLE.article, article, profileMessage);
  }

  @Router.delete("/articles/:slug")
  async deleteArticle(slug: string, auth: string) {
    await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);
    await Article.deleteBySlug(slug);
    await Comment.deleteByTarget(article._id);
    await Favorite.deleteByTarget(article._id);
    await Tag.deleteByTarget(article._id);
  }

  @Router.post("/articles/:slug/comments")
  async addComment(comment: CommentRequest, slug: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);
    if (await Paywall.hasPaywall(article._id)) {
      const membership = await Membership.getMembership(userId);
      if (membership.tier !== Tier.Gold) {
        throw new NotAllowedError("Only Gold members can access paywalled articles");
      }
    }
    const newComment = await Comment.create(userId, article?._id, comment.body);
    const profile = await Profile.getProfileById(userId);

    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse("comment", (merged) => ({ ...merged, id: newComment._id.toString() }), EMPTY_COMMENT.comment, newComment, profileMessage);
  }

  @Router.get("/articles/:slug/comments")
  async getComments(slug: string, auth?: string) {
    let userId: ObjectId | undefined;
    if (auth) {
      try {
        userId = await Jwt.authenticate(auth);
      } catch {
        /* optional auth */
      }
    }
    const article = await Article.getBySlugOrThrow(slug);
    if (await Paywall.hasPaywall(article._id)) {
      if (!userId) {
        throw new NotAllowedError("Only Gold members can access paywalled articles");
      }
      const membership = await Membership.getMembership(userId);
      if (membership.tier !== Tier.Gold) {
        throw new NotAllowedError("Only Gold members can access paywalled articles");
      }
    }
    const comments = await Comment.getCommentsByTarget(article._id);
    const commentMessages = await Promise.all(
      comments.map(async (comment) => {
        const profile = await Profile.getProfileById(comment.author);
        const following = userId ? await Follower.isFollowing(userId, profile._id) : false;
        const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
        return Merge.mergeTransformedObject((merged) => ({ ...merged, id: comment._id.toString() }), EMPTY_COMMENT.comment, comment, profileMessage);
      }),
    );
    return { comments: commentMessages };
  }

  // TOOD: I don't think this works
  @Router.delete("/articles/:slug/comments/:id")
  async deleteComment(auth: string, slug: string, id: string) {
    await Jwt.authenticate(auth);
    await Comment.delete(new ObjectId(id));
  }

  @Router.post("/articles/:slug/favorite")
  async favoriteArticle(auth: string, slug: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);
    const profile = await Profile.getProfileById(article.author);
    const following = await Follower.isFollowing(userId, profile._id);
    await Favorite.create(userId, article?._id);
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const tagList = Tag.stringify(await Tag.getTagByTarget(article._id));
    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
    if (await Paywall.hasPaywall(article._id)) {
      const membership = await Membership.getMembership(userId);
      if (membership.tier !== Tier.Gold) {
        throw new NotAllowedError("Only Gold members can access paywalled articles");
      }
    }
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited: true, favoritesCount }), EMPTY_ARTICLE.article, article, profileMessage);
  }

  @Router.delete("/articles/:slug/favorite")
  async unfavoriteArticle(auth: string, slug: string) {
    const userId = await Jwt.authenticate(auth);

    const article = await Article.getBySlugOrThrow(slug);
    const profile = await Profile.getProfileById(article.author);
    const following = await Follower.isFollowing(userId, profile._id);
    await Favorite.delete(userId, article?._id);
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const tagList = Tag.stringify(await Tag.getTagByTarget(article._id));

    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited: false, favoritesCount }), EMPTY_ARTICLE.article, article, profileMessage);
  }

  @Router.get("/tags")
  async getTags() {
    return { tags: Tag.stringify(await Tag.getTags({})) };
  }
}

export const routes = new Routes();
export default getExpressRouter(routes);
