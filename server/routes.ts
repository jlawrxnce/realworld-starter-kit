import { Account, Article, Comment, Favorite, Follower, Jwt, Map, Merge, Profile, Tag } from "./app";
import { Router, getExpressRouter } from "./framework/router";
import { ObjectId } from "mongodb";
import { NotAllowedError } from "./concepts/errors";
import { ArticleRequest, CommentRequest, UserRequest, UserResponse } from "types/types";

const EMPTY_MESSAGE = (key: string) => {
  return { [key]: {} };
};

const EMPTY_ARTICLE = (favorited: boolean = true) => {
  return {
    article: {
      slug: "",
      title: "",
      description: "",
      body: "",
      tagList: [],
      createdAt: new Date("0").toISOString(),
      updatedAt: new Date("0").toISOString(),
      favorited: favorited,
      favoritesCount: favorited ? 1 : 0,
      author: { username: "", bio: "", image: "", following: false },
      hasPaywall: false,
    },
  };
};
const EMPTY_PROFILE = { profile: { username: "", bio: "", image: "", following: false } };
const EMPTY_USER = { user: { username: "", bio: "", image: "", email: "", token: "" } };
const EMPTY_COMMENT = { comment: { id: 0, body: "", createdAt: new Date("01").toISOString(), updatedAt: new Date("01").toISOString(), author: EMPTY_PROFILE.profile } };

class Routes {
  @Router.get("/")
  async getRoot() {
    return { message: "Welcome to the RealWorld API" };
  }

  @Router.post("/membership")
  async activateMembership(auth: string, body: MembershipRequest) {
    const userId = await Jwt.authenticate(auth);
    const membership = await Membership.create(userId, body.tier as Tier);
    if (!membership) {
      throw new NotAllowedError("Failed to create membership");
    }
    const profile = await Profile.getProfileById(userId);
    return Merge.createResponse<MembershipResponse>("membership", {
      username: "",
      tier: Tier.Free,
      renewalDate: new Date().toISOString(),
      autoRenew: false
    }, membership, profile);
  }

  @Router.put("/membership")
  async updateMembership(auth: string, body: MembershipRequest) {
    const userId = await Jwt.authenticate(auth);
    const membership = await Membership.update(userId, body.tier as Tier, body.autoRenew ?? false);
    const profile = await Profile.getProfileById(userId);
    return Merge.createResponse<MembershipResponse>("membership", {
      username: "",
      tier: Tier.Free,
      renewalDate: new Date().toISOString(),
      autoRenew: false
    }, membership, profile);
  }

  @Router.get("/membership/:username")
  async getMembership(auth: string, username: string) {
    await Jwt.authenticate(auth);
    const profile = await Profile.getProfileByUsername(username);
    const membership = await Membership.getMembership(profile._id);
    return Merge.createResponse<MembershipResponse>("membership", {
      username: "",
      tier: Tier.Free,
      renewalDate: new Date().toISOString(),
      autoRenew: false
    }, membership, profile);
  }

  @Router.put("/articles/:slug/paywall")
  async togglePaywall(auth: string, slug: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);
    if (article.author.toString() !== userId.toString()) {
      throw new NotAllowedError("Only the article author can toggle paywall");
    }
    const hasGoldAccess = await Membership.isGoldMember(userId);
    if (!hasGoldAccess) {
      throw new NotAllowedError("Gold membership required to add paywall");
    }
    const paywall = await Paywall.toggle(article._id);
    const profile = await Profile.getProfileById(article.author);
    const favorited = await Favorite.isFavorited(userId, article._id);
    return Merge.createTransformedResponse(
      "article",
      (merged) => ({ ...merged, favorited, hasPaywall: paywall.enabled }),
      EMPTY_ARTICLE(favorited).article,
      article,
      profile,
    );
  }

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
    try {
      const userId = await Jwt.authenticate(auth);
      const account = await Account.getAccountById(userId);
      const profile = await Profile.getProfileById(userId);
      return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, { token: auth });
    } catch (e) {
      return EMPTY_MESSAGE("user");
    }
  }

  @Router.put("/user")
  async updateUser(user: UserRequest, auth: string) {
    try {
      const userId = await Jwt.authenticate(auth);
      const account = await Account.update(userId, { ...user });
      const profile = await Profile.update(userId, { ...user });
      return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, { token: auth });
    } catch (e) {
      return EMPTY_MESSAGE("user");
    }
  }

  @Router.get("/profiles/:username")
  async getProfile(username: string, auth: string) {
    let userId: ObjectId | undefined;
    if (auth) {
      try {
        userId = await Jwt.authenticate(auth);
      } catch (e) {
        return EMPTY_MESSAGE("profile");
      }
    }
    const profile = await Profile.getProfileByUsername(username);
    const following = userId ? await Follower.isFollowing(userId, profile._id) : false;
    return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
  }

  @Router.post("/profiles/:username/follow")
  async followProfile(username: string, auth: string) {
    try {
      const userId = await Jwt.authenticate(auth);
      const profile = await Profile.getProfileByUsername(username);
      await Follower.create(userId, profile._id);
      return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
    } catch (e) {
      if (e instanceof NotAllowedError) return EMPTY_MESSAGE("profile");
      return { profile: { username: "", bio: "", image: "", following: true } };
    }
  }

  @Router.delete("/profiles/:username/follow")
  async unfollowProfile(username: string, auth: string) {
    try {
      const userId = await Jwt.authenticate(auth);
      const profile = await Profile.getProfileByUsername(username);
      await Follower.delete(userId, profile._id);
      return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following: false }), EMPTY_PROFILE.profile, profile);
    } catch (e) {
      if (e instanceof NotAllowedError) return EMPTY_MESSAGE("profile");
      return { profile: { username: "", bio: "", image: "", following: false } };
    }
  }

  @Router.post("/articles")
  async createArticle(article: ArticleRequest, auth: string) {
    try {
      const userId = await Jwt.authenticate(auth);
      const profile = await Profile.getProfileById(userId);
      const newArticle = await Article.create(userId, article.title, article.description, article.body);
      await Tag.create(newArticle._id, article.tagList ?? []);

      const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true, favoritesCount: 0 }), EMPTY_PROFILE.profile, profile);
      return Merge.createTransformedResponse(
        "article",
        (merged) => ({ ...merged, tagList: article.tagList ?? [], favorited: false, favoritesCount: 0 }),
        EMPTY_ARTICLE(false).article,
        newArticle,
        profileMessage,
      );
    } catch (e) {
      if (e instanceof NotAllowedError) return EMPTY_MESSAGE("article");
      return EMPTY_ARTICLE;
    }
  }

  @Router.put("/articles/:slug")
  async updateArticle(slug: string, article: ArticleRequest, auth: string) {
    try {
      const userId = await Jwt.authenticate(auth);

      const profile = await Profile.getProfileById(userId);
      const oldArticle = await Article.getBySlugOrThrow(slug);
      const newArticle = await Article.update(oldArticle._id, { title: article.title, description: article.description, body: article.body });
      const favoritesCount = await Favorite.countTargetFavorites(newArticle._id);
      await Tag.update(oldArticle._id, article.tagList ?? []);

      const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true, favoritesCount: favoritesCount }), EMPTY_PROFILE.profile, profile);
      return Merge.createTransformedResponse(
        "article",
        (merged) => ({ ...merged, tagList: article.tagList ?? [], favorited: false, favoritesCount }),
        EMPTY_ARTICLE(false).article,
        newArticle,
        profileMessage,
      );
    } catch (e) {
      if (e instanceof NotAllowedError) return EMPTY_MESSAGE("article");
      return EMPTY_ARTICLE;
    }
  }

  @Router.get("/articles")
  async listArticles(tag: string, author: string, favorited: string, limit: number, offset: number, auth: string) {
    try {
      let userId: ObjectId | undefined;
      if (auth) {
        try {
          userId = await Jwt.authenticate(auth);
        } catch (e) {
          return EMPTY_MESSAGE("articles");
        }
      }
      if (!limit) limit = 20;
      if (!offset) offset = 0;

      let articles = await Article.getArticles();
      let authorId: ObjectId;
      if (author) {
        authorId = (await Profile.getProfileByUsername(author))._id;
      }

      let tagArticleIds: Set<string>;
      if (tag) {
        tagArticleIds = new Set((await Tag.getTagByContent(tag)).map((tag) => tag.target.toString()));
      }

      let favoriteIds: Set<string>;
      if (favorited) {
        favoriteIds = new Set((await Favorite.getFavorites({ userId })).map((favorite) => favorite.target.toString()));
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
          return Merge.mergeTransformedObject((merged) => ({ ...merged, tagList, favorited, favoritesCount }), EMPTY_ARTICLE(false).article, article, profileMessage);
        }),
      );
      return { articles: articleMessages, articlesCount: articleMessages.length };
    } catch (e) {
      return { articles: [], articlesCount: 0 };
    }
  }

  @Router.get("/articles/feed")
  async getFeedArticles(limit: number, offset: number, auth: string) {
    try {
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
          return Merge.mergeTransformedObject((merged) => ({ ...merged, tagList, favorited, favoritesCount }), EMPTY_ARTICLE(false).article, article, profileMessage);
        }),
      );
      return { articles: articleMessages, articlesCount: articleMessages.length };
    } catch (e) {
      return { articles: [], articlesCount: 0 };
    }
  }

  @Router.get("/articles/:slug")
  async getArticle(slug: string, auth?: string) {
    try {
      let userId: ObjectId | undefined;
      if (auth) {
        try {
          userId = await Jwt.authenticate(auth);
        } catch (e) {
          // Invalid auth token, continue as unauthenticated
        }
      }
      const article = await Article.getBySlugOrThrow(slug);
      const profile = await Profile.getProfileById(article.author);
      const favorited = userId ? await Favorite.favorites.readOne({ userId, targetId: article._id }) !== null : false;
      const hasPaywall = await Paywall.isPaywalled(article._id);
      
      // Check paywall access
      if (hasPaywall) {
        if (!userId) {
          throw new NotAllowedError("Authentication required for paywalled content");
        }
        const hasAccess = await Membership.isGoldMember(userId);
        if (!hasAccess) {
          throw new NotAllowedError("Gold membership required for paywalled content");
        }
      }

      return Merge.createTransformedResponse(
        "article",
        (merged) => ({ ...merged, favorited, hasPaywall }),
        EMPTY_ARTICLE(favorited).article,
        article,
        profile,
      );
    } catch (e) {
      if (e instanceof NotAllowedError) {
        throw e;
      }
      return EMPTY_MESSAGE("article");
    }
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
    try {
      const userId = await Jwt.authenticate(auth);
      const article = await Article.getBySlugOrThrow(slug);
      const newComment = await Comment.create(userId, article?._id, comment.body);
      const profile = await Profile.getProfileById(userId);

      const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
      return Merge.createTransformedResponse("comment", (merged) => ({ ...merged, id: newComment._id.toString() }), EMPTY_COMMENT.comment, newComment, profileMessage);
    } catch (e) {
      return EMPTY_COMMENT;
    }
  }

  @Router.get("/articles/:slug/comments")
  async getComments(slug: string, auth?: string) {
    try {
      let userId: ObjectId | undefined;
      if (auth) {
        try {
          userId = await Jwt.authenticate(auth);
        } catch (e) {
          // Invalid auth token, continue as unauthenticated
        }
      }
      const article = await Article.getBySlugOrThrow(slug);
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
    } catch (e) {
      return { comments: [] };
    }
  }

  // TOOD: I don't think this works
  @Router.delete("/articles/:slug/comments/:id")
  async deleteComment(auth: string, slug: string, id: string) {
    await Jwt.authenticate(auth);
    await Comment.delete(new ObjectId(id));
  }

  @Router.post("/articles/:slug/favorite")
  async favoriteArticle(slug: string, auth: string) {
    try {
      const userId = await Jwt.authenticate(auth);
      const article = await Article.getBySlugOrThrow(slug);
      
      // Check paywall access
      const hasPaywall = await Paywall.isPaywalled(article._id);
      if (hasPaywall) {
        const hasAccess = await Membership.isGoldMember(userId);
        if (!hasAccess) {
          throw new NotAllowedError("Gold membership required for paywalled content");
        }
      }
      
      await Favorite.create(userId, article._id);
      const profile = await Profile.getProfileById(article.author);
      return Merge.createTransformedResponse(
        "article",
        (merged) => ({ ...merged, favorited: true }),
        EMPTY_ARTICLE(true).article,
        article,
        profile,
      );
    } catch (e) {
      if (e instanceof NotAllowedError) {
        throw e;
      }
      return EMPTY_MESSAGE("article");
    }
  }

  @Router.delete("/articles/:slug/favorite")
  async unfavoriteArticle(auth: string, slug: string) {
    try {
      const userId = await Jwt.authenticate(auth);

      const article = await Article.getBySlugOrThrow(slug);
      const profile = await Profile.getProfileById(article.author);
      const following = await Follower.isFollowing(userId, profile._id);
      await Favorite.delete(userId, article?._id);
      const favoritesCount = await Favorite.countTargetFavorites(article._id);
      const tagList = Tag.stringify(await Tag.getTagByTarget(article._id));

      const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
      return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited: false, favoritesCount }), EMPTY_ARTICLE(false).article, article, profileMessage);
    } catch (e) {
      if (e instanceof NotAllowedError) return EMPTY_MESSAGE("article");
      return EMPTY_ARTICLE(false);
    }
  }

  @Router.get("/tags")
  async getTags() {
    return { tags: Tag.stringify(await Tag.getTags({})) };
  }
}


  @Router.put("/articles/:slug/paywall")
  async togglePaywall(auth: string, slug: string) {
    const article = await Article.getBySlug(slug);
    if (article === null) {
      throw new NotFoundError(`Article ${slug} does not exist!`);
    }
    const userId = await Jwt.authenticate(auth);
    if (article.author.toString() !== userId.toString()) {
      throw new NotAllowedError("Only the author can toggle the paywall");
    }
    const isGold = await Membership.isGoldMember(userId);
    if (!isGold) {
      throw new NotAllowedError("Gold membership required to enable paywall");
    }
    const paywall = await Paywall.toggle(article._id);
    const profile = await Profile.getProfileById(article.author);
    const favorited = (await Favorite.favorites.readOne({ userId, targetId: article._id })) !== null;
    const following = await Follower.isFollowing(userId, article.author);
    return Merge.createResponse("article", EMPTY_ARTICLE(favorited).article, article, profile, { favorited, following, hasPaywall: paywall?.enabled ?? false });
  }

  @Router.post("/articles/:slug/favorite")
  async favoriteArticle(auth: string, slug: string) {
    const article = await Article.getBySlug(slug);
    if (article === null) {
      throw new NotFoundError(`Article ${slug} does not exist!`);
    }
    const userId = await Jwt.authenticate(auth);
    const paywall = await Paywall.getOrCreate(article._id);
    if (paywall && paywall.enabled) {
      const isGold = await Membership.isGoldMember(userId);
      if (!isGold) {
        throw new NotAllowedError("Gold membership required for paywalled content");
      }
    }
    await Favorite.favorites.createOne({ userId, targetId: article._id });
    const profile = await Profile.getProfileById(article.author);
    const following = await Follower.isFollowing(userId, article.author);
    return Merge.createResponse("article", EMPTY_ARTICLE().article, article, profile, { favorited: true, following, hasPaywall: paywall.enabled });
  }

  @Router.get("/articles/:slug")
  async getArticle(auth: string | undefined, slug: string) {
    const article = await Article.getBySlug(slug);
    if (article === null) {
      throw new NotFoundError(`Article ${slug} does not exist!`);
    }
    const paywall = await Paywall.getOrCreate(article._id);
    if (paywall && paywall.enabled) {
      if (!auth) {
        throw new NotAllowedError("Authentication required for paywalled content");
      }
      const userId = await Jwt.authenticate(auth);
      const isGold = await Membership.isGoldMember(userId);
      if (!isGold) {
        throw new NotAllowedError("Gold membership required for paywalled content");
      }
    }
    const profile = await Profile.getProfileById(article.author);
    const userId = auth ? await Jwt.authenticate(auth) : null;
    const favorited = userId ? (await Favorite.favorites.readOne({ userId, articleId: article._id })) !== null : false;
    const following = userId ? await Follower.isFollowing(userId, article.author) : false;
    return Merge.createResponse("article", EMPTY_ARTICLE(favorited).article, article, profile, { favorited, following, hasPaywall: paywall?.enabled ?? false });
  }
}

  @Router.post("/membership")
  async activateMembership(auth: string, body: MembershipRequest) {
    const userId = await Jwt.authenticate(auth);
    const membership = await Membership.create(userId, body.tier as Tier);
    const profile = await Profile.getProfileById(userId);
    return Merge.createResponse<MembershipResponse>("membership", {
      username: "",
      tier: Tier.Free,
      renewalDate: new Date().toISOString(),
      autoRenew: false
    }, membership, profile);
  }

  @Router.put("/membership")
  async updateMembership(auth: string, body: MembershipRequest) {
    const userId = await Jwt.authenticate(auth);
    const membership = await Membership.update(userId, body.tier as Tier, body.autoRenew ?? false);
    const profile = await Profile.getProfileById(userId);
    return Merge.createResponse<MembershipResponse>("membership", {
      username: "",
      tier: Tier.Free,
      renewalDate: new Date().toISOString(),
      autoRenew: false
    }, membership, profile);
  }

  @Router.get("/membership/:username")
  async getMembership(auth: string, username: string) {
    await Jwt.authenticate(auth);
    const profile = await Profile.getProfileByUsername(username);
    const membership = await Membership.getMembership(profile._id);
    return Merge.createResponse<MembershipResponse>("membership", {
      username: "",
      tier: Tier.Free,
      renewalDate: new Date().toISOString(),
      autoRenew: false
    }, membership, profile);
  }

  @Router.put("/articles/:slug/paywall")
  async togglePaywall(auth: string, slug: string) {
    const userId = await Jwt.authenticate(auth);
    const article = await Article.getBySlugOrThrow(slug);
    if (article.author.toString() !== userId.toString()) {
      throw new NotAllowedError("Only the article author can toggle paywall");
    }
    const hasGoldAccess = await Membership.isGoldMember(userId);
    if (!hasGoldAccess) {
      throw new NotAllowedError("Gold membership required to add paywall");
    }
    const paywall = await Paywall.toggle(article._id);
    const profile = await Profile.getProfileById(article.author);
    const favorited = await Favorite.isFavorited(userId, article._id);
    return Merge.createTransformedResponse(
      "article",
      (merged) => ({ ...merged, favorited, hasPaywall: paywall.enabled }),
      EMPTY_ARTICLE(favorited).article,
      article,
      profile,
    );
  }

export const routes = new Routes();
export default getExpressRouter(routes);
