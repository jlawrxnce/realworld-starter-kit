import { Account, Article, Comment, Favorite, Follower, Jwt, Merge, Profile, Tag, Membership, Paywall, View } from "./app";
import { Router, getExpressRouter } from "./framework/router";
import { ObjectId } from "mongodb";
import { ArticleRequest, CommentRequest, UserRequest, UserResponse, Tier, MembershipRequest } from "./types/types";
import { NotAllowedError, NotFoundError } from "./concepts/errors";

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
    hasPaywall: false,
    author: { username: "", bio: "", image: "", following: "" },
  },
};

const EMPTY_PROFILE = { profile: { username: "", bio: "", image: "", following: false, hasPaywall: false } };
const EMPTY_USER = { user: { username: "", bio: "", image: "", email: "", token: "" } };
const EMPTY_COMMENT = { comment: { id: 0, body: "", createdAt: new Date("01").toISOString(), updatedAt: new Date("01").toISOString(), author: EMPTY_PROFILE.profile } };
const EMPTY_MEMBBERSHIP = {
  membership: {
    username: "",
    tier: Tier.Free,
    renewalDate: new Date("01").toISOString(),
    autoRenew: false,
    totalRevenue: 0,
  },
};

class Routes {
  @Router.post("/users")
  async register(user: UserRequest) {
    const account = await Account.create(user.username, user.password, user.email);
    const profile = await Profile.create(account._id, user.username, user.bio, user.image);
    const jwt = await Jwt.create(account._id, account.username);
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
  async updateUser(user: UserRequest, auth: string) {
    const _id = await Jwt.authenticate(auth);
    const membership = await Membership.getMembership(_id);

    // Check if user is trying to set paywall and has appropriate tier
    if (user.hasPaywall !== undefined) {
      if (membership.tier === Tier.Free) {
        throw new NotAllowedError("Free users cannot set paywall");
      }
    }

    const account = await Account.update(_id, user);
    const profile = await Profile.update(_id, user);
    await Paywall.toggle(_id);
    const jwt = await Jwt.update(account._id, account.username);
    return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, { token: jwt });
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
    const hasPaywall = await Paywall.isPaywalled(profile._id);
    if (hasPaywall) {
      if (!userId) {
        throw new NotAllowedError("Must be logged in to view paywalled content");
      }
      const membership = await Membership.getMembership(userId);
      if (membership.tier === Tier.Free) {
        throw new NotAllowedError("Free users cannot view paywalled content");
      }
    }
    return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following, hasPaywall }), EMPTY_PROFILE.profile, profile);
  }

  @Router.post("/profiles/:username/follow")
  async followProfile(username: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const profile = await Profile.getProfileByUsername(username);
    const hasPaywall = await Paywall.isPaywalled(profile._id);
    console.log("hasPaywall", hasPaywall, profile);
    if (hasPaywall) {
      const membership = await Membership.getMembership(userId);
      if (membership.tier === Tier.Free) {
        throw new NotAllowedError("Free users cannot view paywalled content");
      }
    }
    await Follower.create(userId, profile._id);
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

  @Router.put("/articles/:slug/view")
  async viewArticle(slug: string, auth?: string) {
    const existingArticle = await Article.getBySlug(slug);
    if (!existingArticle) {
      throw new NotFoundError(`Article ${slug} does not exist!`);
    }

    // Get viewer's membership tier
    let viewerId: ObjectId | undefined;
    if (auth) {
      try {
        viewerId = await Jwt.authenticate(auth);
      } catch {
        // Invalid token, treat as anonymous viewer
      }
    }
    const hasPaywall = await Paywall.isPaywalled(existingArticle._id);
    // Check if article has paywall and viewer has access
    if (hasPaywall) {
      if (!viewerId) {
        throw new NotAllowedError("Must be logged in to view paywalled content");
      }
      const viewerMembership = await Membership.getMembership(viewerId);
      if (viewerMembership.tier === Tier.Free) {
        throw new NotAllowedError("Free users cannot view paywalled content");
      }
    }

    // Create view if logged in and not the author
    if (viewerId) {
      await View.create(existingArticle._id, viewerId, "Article");

      // Calculate and update revenue if article has paywall
      if (hasPaywall) {
        const authorMembership = await Membership.getMembership(existingArticle.author);
        const revenueAmount = authorMembership.tier === Tier.Gold ? 0.25 : 0.1;
        await Membership.update(existingArticle.author, {
          totalRevenue: authorMembership.totalRevenue + revenueAmount,
        });
      }
    }

    // Increment view count

    const tagList = await Tag.stringify(await Tag.getTagByTarget(existingArticle._id));
    const favorited = viewerId ? await Favorite.isFavoritedByUser(viewerId, existingArticle._id) : false;
    const favoritesCount = await Favorite.countTargetFavorites(existingArticle._id);
    const following = viewerId ? await Follower.isFollowing(viewerId, existingArticle.author) : false;
    const profile = await Profile.getProfileById(existingArticle.author);
    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);

    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall }), EMPTY_ARTICLE.article, existingArticle, profileMessage);
  }

  @Router.put("/articles/:slug")
  async updateArticle(article: ArticleRequest, auth: string, slug: string) {
    const _id = await Jwt.authenticate(auth);
    const existingArticle = await Article.getBySlug(slug);
    if (existingArticle === null) {
      throw new NotFoundError(`Article ${slug} does not exist!`);
    }
    if (existingArticle.author.toString() !== _id.toString()) {
      throw new NotAllowedError("You can only edit your own articles!");
    }

    // Check if user is trying to set paywall and has appropriate tier
    if (article.hasPaywall !== undefined) {
      const membership = await Membership.getMembership(_id);
      if (membership.tier === Tier.Free) {
        throw new NotAllowedError("Free users cannot set paywall");
      }
    }

    const updated = await Article.update(existingArticle._id, article);
    const profile = await Profile.getProfileById(_id);
    const following = await Follower.isFollowing(_id, profile._id);
    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(updated._id));
    const favorited = await Favorite.isFavoritedByUser(_id, updated._id);
    const favoritesCount = await Favorite.countTargetFavorites(updated._id);
    const hasPaywall = await Paywall.isPaywalled(updated._id);
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall }), EMPTY_ARTICLE.article, updated, profileMessage);
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
    const followIds = await Follower.getFollowers({ userId }).then((followers) => followers.map((follower) => follower.target));
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
        const hasPaywall = await Paywall.isPaywalled(article._id);

        const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
        return Merge.mergeTransformedObject((merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall }), EMPTY_ARTICLE.article, article, profileMessage);
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
    const hasPaywall = await Paywall.isPaywalled(article._id);

    if (hasPaywall) {
      if (!userId) {
        throw new NotAllowedError("Authentication required for paywalled content");
      }
      const hasMembership = await Membership.verifyMembershipAccess(userId);
      if (!hasMembership) {
        throw new NotAllowedError("Gold membership required for paywalled content");
      }
    }

    const profile = await Profile.getProfileById(article?.author);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
    const favorited = userId ? await Favorite.isFavoritedByUser(userId, article._id) : false;
    const favoritesCount = await Favorite.countTargetFavorites(article._id);

    const following = userId ? await Follower.isFollowing(userId, profile._id) : false;
    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
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

    // Add paywall check
    const hasPaywall = await Paywall.isPaywalled(article._id);
    if (hasPaywall) {
      const hasMembership = await Membership.verifyMembershipAccess(userId);
      if (!hasMembership) {
        throw new NotAllowedError("Gold membership required for paywalled content");
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

    // Add paywall check
    const hasPaywall = await Paywall.isPaywalled(article._id);
    if (hasPaywall) {
      if (!userId) {
        throw new NotAllowedError("Authentication required for paywalled content");
      }
      const hasMembership = await Membership.verifyMembershipAccess(userId);
      if (!hasMembership) {
        throw new NotAllowedError("Gold membership required for paywalled content");
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
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);

    // Add paywall check
    const hasPaywall = await Paywall.isPaywalled(article._id);
    if (hasPaywall) {
      const hasMembership = await Membership.verifyMembershipAccess(userId);
      if (!hasMembership) {
        throw new Error("Gold membership required for paywalled content");
      }
    }

    await Comment.delete(new ObjectId(id));
  }

  @Router.post("/articles/:slug/favorite")
  async favoriteArticle(slug: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);

    // Add paywall check
    const hasPaywall = await Paywall.isPaywalled(article._id);
    if (hasPaywall) {
      const hasMembership = await Membership.verifyMembershipAccess(userId);
      if (!hasMembership) {
        throw new NotAllowedError("Gold membership required for paywalled content");
      }
    }

    await Favorite.create(userId, article._id);
    const profile = await Profile.getProfileById(article.author);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
    const favorited = true;
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const following = await Follower.isFollowing(userId, profile._id);

    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall }), EMPTY_ARTICLE.article, article, profileMessage);
  }

  @Router.delete("/articles/:slug/favorite")
  async unfavoriteArticle(slug: string, auth: string) {
    const userId = await Jwt.authenticate(auth);

    const article = await Article.getBySlugOrThrow(slug);
    const hasPaywall = await Paywall.isPaywalled(article._id);
    if (hasPaywall) {
      const hasMembership = await Membership.verifyMembershipAccess(userId);
      if (!hasMembership) {
        throw new NotAllowedError("Gold membership required for paywalled content");
      }
    }

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
    if (membership.tier === Tier.Free) {
      throw new NotAllowedError("Cannot activate Free tier membership");
    }
    const newMembership = await Membership.create(userId, membership.tier);
    if (!newMembership) throw new Error("Failed to create membership");
    const profile = await Profile.getProfileById(userId);
    return Merge.createTransformedResponse("membership", (merged) => ({ ...merged, username: profile.username }), EMPTY_MEMBBERSHIP.membership, newMembership);
  }

  @Router.put("/membership")
  async updateMembership(membership: MembershipRequest, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const updatedMembership = await Membership.update(userId, membership);
    if (!updatedMembership) throw new NotAllowedError("Failed to update membership");
    const profile = await Profile.getProfileById(userId);
    return Merge.createTransformedResponse("membership", (merged) => ({ ...merged, username: profile.username }), EMPTY_MEMBBERSHIP.membership, updatedMembership);
  }

  @Router.get("/membership")
  async getMembership(auth: string) {
    const userId = await Jwt.authenticate(auth);
    const membership = await Membership.getMembership(userId);
    if (!membership) throw new Error("Failed to get membership");
    const profile = await Profile.getProfileById(userId);
    return Merge.createTransformedResponse("membership", (merged) => ({ ...merged, username: profile.username }), EMPTY_MEMBBERSHIP.membership, membership);
  }

  @Router.put("/articles/:slug/paywall")
  async togglePaywall(slug: string, auth: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);

    if (article.author.toString() !== userId.toString()) {
      throw new NotAllowedError("Only the article author can toggle paywall");
    }

    const hasMembership = await Membership.verifyMembershipAccess(userId);
    if (!hasMembership) {
      throw new NotAllowedError("Membership required to add paywall");
    }

    const paywall = await Paywall.toggle(article._id);
    if (!paywall) throw new Error("Failed to toggle paywall");
    const profile = await Profile.getProfileById(article.author);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
    const favorited = await Favorite.isFavoritedByUser(userId, article._id);
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const following = await Follower.isFollowing(userId, profile._id);

    const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
    return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount, hasPaywall: paywall.enabled }), EMPTY_ARTICLE.article, article, profileMessage);
  }
}

export const routes = new Routes();
export default getExpressRouter(routes);
