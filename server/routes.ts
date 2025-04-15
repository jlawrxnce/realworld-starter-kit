import { Account, Article, Comment, Favorite, Follower, Jwt, Map, Merge, Profile, Tag, WebSession } from "./app";
import { WebSessionDoc } from "./concepts/websession";
import { Router, getExpressRouter } from "./framework/router";
import { ObjectId } from "mongodb";
import { NotAllowedError, NotFoundError } from "./concepts/errors";
import { ArticleRequest, CommentRequest, CommentResponse, UserRequest, UserResponse } from "types/types";

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
      author: { username: "", bio: "", image: "", following: "" },
    },
  };
};
const EMPTY_PROFILE = { profile: { username: "", bio: "", image: "", following: false } };
const EMPTY_USER = { user: { username: "", bio: "", image: "", email: "", token: "" } };
const EMPTY_COMMENT = { comment: { id: 0, body: "", createdAt: new Date("01").toISOString(), updatedAt: new Date("01").toISOString(), author: EMPTY_PROFILE.profile } };

class Routes {
  @Router.get("/session")
  async getSessionUser(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    return user;
  }

  @Router.post("/users")
  async register(session: WebSessionDoc, user: UserRequest) {
    const account = await Account.create(user.username, user.password, user.email);
    const profile = await Profile.create(account._id, user.username, user.bio, user.image);
    const jwt = await Jwt.create(account._id, account.username);
    await Follower.create(account._id, account._id);
    WebSession.start(session, account._id);

    return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, jwt);
  }

  @Router.post("/users/login")
  async login(session: WebSessionDoc, user: UserRequest) {
    const _id = await Account.authenticate(user.email, user.password ?? "");
    const account = await Account.getAccountById(_id);
    const profile = await Profile.getProfileById(_id);
    const jwt = await Jwt.update(account._id, account.username);
    WebSession.start(session, _id);
    console.log("does my token get returned", Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, jwt));
    return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, jwt);
  }

  @Router.get("/user")
  async getUser(session: WebSessionDoc, auth: string) {
    try {
      const userId = WebSession.getUser(session);
      const jwt = await Jwt.authenticate(userId, auth);
      const account = await Account.getAccountById(userId);
      const profile = await Profile.getProfileById(userId);
      return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, jwt);
    } catch (e) {
      return EMPTY_MESSAGE("user");
    }
  }

  @Router.put("/user")
  async updateUser(session: WebSessionDoc, user: UserRequest, auth: string) {
    const userId = WebSession.getUser(session);
    try {
      const jwt = await Jwt.authenticate(userId, auth);
      const account = Account.update(userId, { ...user });
      const profile = Profile.update(userId, { ...user });
      return Merge.createResponse<UserResponse>("user", EMPTY_USER.user, account, profile, jwt);
    } catch (e) {
      return EMPTY_MESSAGE("user");
    }
  }

  @Router.get("/profiles/:username")
  async getProfile(session: WebSessionDoc, username: string) {
    const user = WebSession.getUser(session);
    const profile = await Profile.getProfileByUsername(username);
    const following = await Follower.isFollowing(user, profile._id);
    return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
  }

  @Router.post("/profiles/:username/follow")
  async followProfile(session: WebSessionDoc, username: string, auth: string) {
    try {
      const userId = WebSession.getUser(session);
      await Jwt.authenticate(userId, auth);
      const profile = await Profile.getProfileByUsername(username);
      await Follower.create(userId, profile._id);
      return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
    } catch (e) {
      return { profile: { username: "", bio: "", image: "", following: true } };
    }
  }

  @Router.delete("/profiles/:username/follow")
  async unfollowProfile(session: WebSessionDoc, username: string, auth: string) {
    try {
      const userId = WebSession.getUser(session);
      await Jwt.authenticate(userId, auth);
      const profile = await Profile.getProfileByUsername(username);
      await Follower.delete(userId, profile._id);
      return Merge.createTransformedResponse("profile", (merged) => ({ ...merged, following: false }), profile);
    } catch (e) {
      if (e instanceof NotAllowedError) return EMPTY_MESSAGE("profile");
      return { profile: { username: "", bio: "", image: "", following: false } };
    }
  }

  @Router.post("/articles")
  async createArticle(session: WebSessionDoc, article: ArticleRequest, auth: string) {
    try {
      const userId = WebSession.getUser(session);
      await Jwt.authenticate(userId, auth);
      const profile = await Profile.getProfileById(userId);
      const newArticle = await Article.create(userId, article.title, article.description, article.body);
      await Tag.create(newArticle._id, article.tagList ?? []);

      const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
      return Merge.createTransformedResponse(
        "article",
        (merged) => ({ ...merged, tagList: article.tagList ?? [], favorited: false, favorites: 0 }),
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
  async updateArticle(session: WebSessionDoc, slug: string, article: ArticleRequest, auth: string) {
    try {
      const userId = WebSession.getUser(session);
      await Jwt.authenticate(userId, auth);

      const profile = await Profile.getProfileById(userId);
      const oldArticle = await Article.getBySlugOrThrow(slug);
      const newArticle = await Article.update(oldArticle._id, { title: article.title, description: article.description, body: article.body });
      await Tag.update(oldArticle._id, article.tagList ?? []);

      const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
      return Merge.createTransformedResponse(
        "article",
        (merged) => ({ ...merged, tagList: article.tagList ?? [], favorited: false, favorites: 0 }),
        EMPTY_ARTICLE(false).article,
        newArticle,
        profileMessage,
      );
    } catch (e) {
      return EMPTY_ARTICLE;
    }
  }

  @Router.get("/articles")
  async listArticles(session: WebSessionDoc, tag: string, author: string, favorited: string, limit: number, offset: number) {
    const userId = WebSession.getUser(session);
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
        const following = await Follower.isFollowing(userId, profile._id);
        const favoritesCount = await Favorite.countTargetFavorites(article._id);
        const favorited = await Favorite.isFavoritedByUser(userId, article._id);
        const tagList = await Tag.getTagByTarget(article._id).then(Tag.stringify);

        const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
        return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount }), EMPTY_ARTICLE(false).article, article, profileMessage);
      }),
    );
    for (const a of articleMessages) {
      console.log("articleMessages", a, a.article.author);
    }
    return { articles: articleMessages, articlesCount: articleMessages.length };
  }

  @Router.get("/articles/feed")
  async getFeedArticles(session: WebSessionDoc, limit: number, offset: number, auth: string) {
    try {
      const userId = WebSession.getUser(session);
      await Jwt.authenticate(userId, auth);

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
          return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount }), EMPTY_ARTICLE(false).article, article, profileMessage);
        }),
      );
      return { articles: articleMessages, articlesCount: articleMessages.length };
    } catch (e) {
      return { articles: [], articlesCount: 0 };
    }
  }

  @Router.get("/articles/:slug")
  async getArticle(session: WebSessionDoc, slug: string) {
    const userId = WebSession.getUser(session);
    try {
      const article = await Article.getBySlugOrThrow(slug);
      const profile = await Profile.getProfileById(article?.author);
      const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
      const favorited = await Favorite.isFavoritedByUser(userId, article._id);
      const favoritesCount = await Favorite.countTargetFavorites(article._id);

      const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
      return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited, favoritesCount }), EMPTY_ARTICLE(false).article, article, profileMessage);
    } catch (e) {
      if (e instanceof NotFoundError) return EMPTY_ARTICLE;
    }
  }

  @Router.delete("/articles/:slug")
  async deleteArticle(session: WebSessionDoc, slug: string, auth: string) {
    const userId = WebSession.getUser(session);
    await Jwt.authenticate(userId, auth);
    const article = await Article.getBySlugOrThrow(slug);
    await Article.deleteBySlug(slug);
    await Comment.deleteByTarget(article._id);
    await Favorite.deleteByTarget(article._id);
    await Tag.deleteByTarget(article._id);
  }

  @Router.post("/articles/:slug/comments")
  async addComment(session: WebSessionDoc, comment: CommentRequest, slug: string) {
    try {
      const userId = WebSession.getUser(session);
      const article = await Article.getBySlugOrThrow(slug);
      const newComment = await Comment.create(userId, article?._id, comment.body);
      const profile = await Profile.getProfileById(userId);

      const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following: true }), EMPTY_PROFILE.profile, profile);
      console.log("testing comment", Merge.createResponse<CommentResponse>("comment", EMPTY_COMMENT.comment, newComment, profileMessage));
      return { comment: Merge.createResponse<CommentResponse>("comment", EMPTY_COMMENT.comment, newComment, profileMessage) };
    } catch (e) {
      return EMPTY_COMMENT;
    }
  }

  @Router.get("/articles/:slug/comments")
  async getComments(session: WebSessionDoc, slug: string) {
    try {
      const userId = WebSession.getUser(session);
      const article = await Article.getBySlugOrThrow(slug);
      const comments = await Comment.getCommentsByTarget(article._id);
      const commentMessages = await Promise.all(
        comments.map(async (comment) => {
          const profile = await Profile.getProfileById(comment.author);
          const following = await Follower.isFollowing(userId, profile._id);
          const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), profile);
          return { comment: Merge.createResponse<CommentResponse>("comment", EMPTY_COMMENT.comment, comment, profileMessage) };
        }),
      );

      return { comments: commentMessages };
    } catch (e) {
      return { comments: [] };
    }
  }

  // TOOD: I don't think this works
  @Router.delete("/articles/:slug/comments/:id")
  async deleteComment(session: WebSessionDoc, auth: string, slug: string, id: string) {
    const userId = WebSession.getUser(session);
    await Jwt.authenticate(userId, auth);
    await Comment.delete(new ObjectId(id));
  }

  @Router.post("/articles/:slug/favorite")
  async favoriteArticle(session: WebSessionDoc, auth: string, slug: string) {
    try {
      const userId = WebSession.getUser(session);
      await Jwt.authenticate(userId, auth);
      const article = await Article.getBySlugOrThrow(slug);
      const profile = await Profile.getProfileById(article.author);
      const following = await Follower.isFollowing(userId, profile._id);
      await Favorite.create(userId, article?._id);
      const favoritesCount = await Favorite.countTargetFavorites(article._id);
      const tagList = Tag.stringify(await Tag.getTagByTarget(article._id));
      const profileMessage = Merge.createTransformedResponse("author", (merged) => ({ ...merged, following }), EMPTY_PROFILE.profile, profile);
      return Merge.createTransformedResponse("article", (merged) => ({ ...merged, tagList, favorited: true, favoritesCount }), EMPTY_ARTICLE(false).article, article, profileMessage);
    } catch (e) {
      if (e instanceof NotAllowedError) return EMPTY_MESSAGE("article");
      return EMPTY_ARTICLE(true);
    }
  }

  @Router.delete("/articles/:slug/favorite")
  async unfavoriteArticle(session: WebSessionDoc, auth: string, slug: string) {
    try {
      const userId = WebSession.getUser(session);
      await Jwt.authenticate(userId, auth);

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

export const routes = new Routes();
export default getExpressRouter(routes);
