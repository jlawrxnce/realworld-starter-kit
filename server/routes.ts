import { NotAllowedError } from "./concepts/errors";
import { Account, Article, Comment, Favorite, Follower, Jwt, Map, Merge, Profile, Tag, Membership, Paywall, View, Revenue } from "./app";
import { Tier } from "./concepts/membership";
import { Router, getExpressRouter } from "./framework/router";
import { ObjectId } from "mongodb";
import { ArticleRequest, CommentRequest, UserRequest, UserResponse, MembershipRequest } from "types/types";

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

const EMPTY_PROFILE = { profile: { username: "", bio: "", image: "", following: false } };
const EMPTY_USER = { user: { username: "", bio: "", image: "", email: "", token: "" } };
const EMPTY_COMMENT = { comment: { id: 0, body: "", createdAt: new Date("01").toISOString(), updatedAt: new Date("01").toISOString(), author: EMPTY_PROFILE.profile } };
const EMPTY_MEMBERSHIP = { membership: { username: "", tier: Tier.Free, renewalDate: new Date("0").toISOString(), autoRenew: false } };

class Routes {
  @Router.post("/users")
  async register(user: UserRequest) {
    const account = await Account.create(user.username, user.password, user.email);
    const profile = await Profile.create(account._id, user.username, user.bio, user.image);
    const jwt = await Jwt.create(account._id, account.username);
    await Follower.create(account._id, account._id);
    return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, { token: jwt });
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
  async updateUser(auth: string, user: UserRequest) {
    const userId = await Jwt.authenticate(auth);
    const membership = await Membership.getByOwner(userId);
    if (user.hasPaywall && membership.tier === Tier.Free) {
      throw new NotAllowedError("Free users cannot enable paywall!");
    }
    const account = await Account.getAccountById(userId);
    const profile = await Profile.update(userId, user);
    if (user.hasPaywall !== undefined) {
      await Paywall.toggle(userId);
    }
    return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, { token: auth });
  }

  @Router.get("/profiles/:username")
  async getProfile(username: string, auth: string) {
    let userId: ObjectId | undefined;
    if (auth) {
      try {
        userId = await Jwt.authenticate(auth);
      } catch {
        /* optional auth */
      }
    }
    const profile = await Profile.getProfileByUsername(username);
    const following = userId ? await Follower.isFollowing(userId, profile._id) : false;
    const paywall = await Paywall.getByContent(profile._id);

    if (paywall?.enabled) {
      if (!userId) {
        throw new NotAllowedError("You must be logged in to view this profile.");
      }
      const userTier = await Membership.getByOwner(userId);
      if (userTier.tier === Tier.Free) {
        throw new NotAllowedError("Only Silver or Gold tier members can view profiles behind paywalls.");
      }
    }
    return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following, hasPaywall: paywall?.enabled ?? false }), EMPTY_PROFILE.profile, profile);
  }

  @Router.post("/profiles/:username/follow")
  async followProfile(username: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const profile = await Profile.getProfileByUsername(username);
    await Follower.create(userId, profile._id);

    const paywall = await Paywall.getByContent(profile._id);
    if (paywall?.enabled) {
      const userTier = await Membership.getByOwner(userId);
      if (userTier.tier !== Tier.Gold) {
        throw new NotAllowedError("Only Gold tier members can follow profiles behind paywalls.");
      }
    }
    return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following: true, paywall }), EMPTY_PROFILE.profile, profile);
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
    const hasPaywall = await Paywall.getByContent(newArticle._id);

    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true, favoritesCount: 0 }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse(
      "article",
      (merged) => ({ ...merged, tagList: article.tagList ?? [], favorited: false, favoritesCount: 0, hasPaywall: hasPaywall?.enabled ?? false }),
      EMPTY_ARTICLE.article,
      newArticle,
      profileMessage,
    );
  }

  @Router.put("/articles/:slug")
  async updateArticle(auth: string, slug: string, article: ArticleRequest) {
    const userId = await Jwt.authenticate(auth);
    const articleDoc = await Article.getBySlug(slug);
    if (!articleDoc || articleDoc.author.toString() !== userId.toString()) {
      throw new NotAllowedError("You are not the author of this article!");
    }
    const membership = await Membership.getByOwner(userId);
    if (article.hasPaywall && membership.tier === Tier.Free) {
      throw new NotAllowedError("Free users cannot enable paywall!");
    }
    const updatedArticle = await Article.update(articleDoc._id, article);
    if (article.hasPaywall !== undefined) {
      await Paywall.toggle(articleDoc._id);
    }
    const profile = await Profile.getProfileById(updatedArticle.author);
    const following = await Follower.isFollowing(userId, updatedArticle.author);
    const favorited = await Favorite.isFavoritedByUser(userId, updatedArticle._id);
    const favoritesCount = await Favorite.countTargetFavorites(updatedArticle._id);
    const tagList = Tag.stringify(await Tag.getTagByTarget(updatedArticle._id));
    return Merge.createResponse<ArticleRequest>("article", EMPTY_ARTICLE.article, updatedArticle, profile, { following, favorited, favoritesCount, tagList });
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
  async getArticle(slug: string, auth?: string) {
    let userId: ObjectId | undefined;
    if (auth) {
      try {
        userId = await Jwt.authenticate(auth);
      } catch {
        /* optional auth */
      }
    }
    const article = await Article.getBySlugOrThrow(slug);
    const profile = await Profile.getProfileById(article.author);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
    const favorited = userId ? await Favorite.isFavoritedByUser(userId, article._id) : false;
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const paywall = await Paywall.getByContent(article._id);

    // PaywallCheck
    if (paywall?.enabled) {
      if (!userId) {
        throw new NotAllowedError("Free users cannot view paywalled articles!");
      }
      const userMembership = await Membership.getByOwner(userId);
      if (userMembership.tier === Tier.Free) {
        throw new NotAllowedError("Free users cannot view paywalled articles!");
      }

      // Record view and revenue if eligible
      if (userId.toString() !== article.author.toString()) {
        await View.create(article._id, userId);
        await Revenue.create(article._id, article.author, userMembership.tier);
      }
    }

    return {
      article: {
        ...EMPTY_ARTICLE.article,
        slug,
        title: article.title,
        description: article.description,
        body: article.body,
        tagList,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
        favorited,
        favoritesCount,
        hasPaywall: paywall?.enabled || false,
        author: {
          username: profile?.username || "",
          bio: profile?.bio || "",
          image: profile?.image || "",
          following: userId ? await Follower.isFollowing(userId, article.author) : false,
        },
      },
    };
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
  async createComment(slug: string, comment: CommentRequest, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);
    let userTier = Tier.Free;
    try {
      const membership = await Membership.getByOwner(userId);
      userTier = membership.tier;
    } catch {
      // Default to Free tier if no membership found
    }
    const paywall = await Paywall.getByContent(article._id);
    if (paywall?.enabled && userTier !== Tier.Gold) {
      throw new NotAllowedError("Article is behind a paywall. Upgrade to Gold tier to comment.");
    }
    const newComment = await Comment.create(userId, article._id, comment.body);
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
    const comments = await Comment.getCommentsByTarget(article._id);
    const paywall = await Paywall.getByContent(article._id);

    let userTier = Tier.Free;
    if (userId) {
      try {
        const membership = await Membership.getByOwner(userId);
        userTier = membership.tier;
      } catch {
        // Default to Free tier if no membership found
      }
    }
    if (paywall?.enabled && userTier !== Tier.Gold) {
      throw new NotAllowedError("Only Gold tier members can view comments.");
    }
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
    const paywall = await Paywall.getByContent(article._id);
    if (paywall?.enabled) {
      const userTier = await Membership.getByOwner(userId);
      if (userTier.tier !== Tier.Gold) {
        throw new NotAllowedError("Only Gold tier members can favorite articles behind paywalls.");
      }
    }
    await Favorite.create(userId, article?._id);
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const tagList = Tag.stringify(await Tag.getTagByTarget(article._id));
    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
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

  @Router.post("/membership")
  async activateMembership(membership: MembershipRequest, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const tier = membership.tier as Tier;
    const result = await Membership.activateMembership(userId, tier);
    if (!result) throw new Error("Failed to activate membership");
    const profile = await Profile.getProfileById(userId);
    return Merge.createTransformedResponse("membership", (merged) => ({ ...merged, username: profile.username, totalRevenue: 0 }), EMPTY_MEMBERSHIP.membership, result);
  }

  @Router.put("/membership")
  async updateMembership(membership: MembershipRequest, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const result = await Membership.updateMembership(userId, membership);
    const profile = await Profile.getProfileById(userId);
    return Merge.createTransformedResponse("membership", (merged) => ({ ...merged, username: profile.username }), EMPTY_MEMBERSHIP.membership, result);
  }

  @Router.get("/membership")
  async getMembership(auth: string) {
    const userId = await Jwt.authenticate(auth);
    const result = await Membership.getByOwner(userId);
    if (!result) throw new Error("Membership not found");
    const profile = await Profile.getProfileById(userId);
    const totalRevenue = await Revenue.getTotalRevenue(userId);
    return Merge.createTransformedResponse("membership", (merged) => ({ ...merged, username: profile.username, totalRevenue }), EMPTY_MEMBERSHIP.membership, result);
  }

  @Router.put("/articles/:slug/paywall")
  async togglePaywall(slug: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);
    if (article.author.toString() !== userId.toString()) {
      throw new Error("Only the article author can toggle the paywall");
    }
    let userTier = Tier.Free;
    try {
      const membership = await Membership.getByOwner(userId);
      userTier = membership.tier;
    } catch {
      // Default to Free tier if no membership found
    }
    if (userTier === Tier.Free) {
      throw new NotAllowedError("Only Gold tier members can enable paywalls");
    }
    const paywall = await Paywall.toggle(article._id);
    const author = await Profile.getProfileById(article.author);
    const favorites = await Favorite.getFavorites(article._id);
    const favorited = favorites.some((favorite) => favorite.userId.toString() === userId.toString());
    const favoritesCount = favorites.length;
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
    const following = await Follower.isFollowing(userId, article.author);
    const authorMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, author);
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall: paywall?.enabled }), EMPTY_ARTICLE.article, article, authorMessage);
  }

  @Router.put("/articles/:slug/view")
  async viewArticle(auth: string, slug: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlug(slug);
    if (!article) {
      throw new NotAllowedError("Article not found!");
    }
    const paywall = await Paywall.getByContent(article._id);
    const userMembership = await Membership.getByOwner(userId);
    const authorMembership = await Membership.getByOwner(article.author);

    if (paywall?.enabled && userMembership.tier === Tier.Free) {
      throw new NotAllowedError("Free users cannot view paywalled articles!");
    }

    const view = await View.create(article._id, userId);
    if (view && paywall?.enabled) {
      await Revenue.create(article._id, article.author, authorMembership.tier);
    }

    const profile = await Profile.getProfileById(article.author);
    const following = await Follower.isFollowing(userId, article.author);
    const favorited = await Favorite.isFavoritedByUser(userId, article._id);
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));

    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);

    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall: paywall?.enabled }), EMPTY_ARTICLE.article, article, profileMessage);
  }
}

export const routes = new Routes();
export default getExpressRouter(routes);
