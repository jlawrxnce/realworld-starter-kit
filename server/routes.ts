import type { ArticleMessage, UserMessage } from "types/types";
import { Account, Article, Comment, Favorite, Follower, Jwt, Map, Merge, Profile, Tag, WebSession } from "./app";
import { WebSessionDoc } from "./concepts/websession";
import { Router, getExpressRouter } from "./framework/router";
import { CommentDoc } from "concepts/comment";
import { ObjectId } from "mongodb";
import { NotFoundError } from "./concepts/errors";

class Routes {
  @Router.get("/session")
  async getSessionUser(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    return user;
  }

  @Router.post("/users")
  async register(session: WebSessionDoc, user: UserMessage) {
    // TODO : input validator
    const account = await Account.create(user.username, user.password ?? "", user.email);
    const profile = await Profile.create(account._id, user.username, user.bio, user.image);
    const jwt = await Jwt.create(account._id, account.username);
    // ensure user follows self
    await Follower.create(account._id, account._id);
    WebSession.start(session, account._id);
    return { user: Merge.createUserMessage(account, profile, jwt) };
  }

  @Router.post("/users/login")
  async login(session: WebSessionDoc, user: UserMessage) {
    const _id = await Account.authenticate(user.email, user.password ?? "");
    const account = await Account.getAccountById(_id);
    const profile = await Profile.getProfileById(_id);
    const jwt = await Jwt.update(account._id, account.username);
    WebSession.start(session, _id);
    return { user: Merge.createUserMessage(account, profile, jwt) };
  }

  @Router.get("/user")
  async getUser(session: WebSessionDoc, auth: string) {
    const userId = WebSession.getUser(session);
    const account = await Account.getAccountById(userId);
    const profile = await Profile.getProfileById(userId);
    const jwt = await Jwt.authenticate(userId, auth);
    return { user: Merge.createUserMessage(await account, await profile, await jwt) };
  }

  @Router.put("/user")
  async updateUser(session: WebSessionDoc, user: UserMessage, auth: string) {
    const userId = WebSession.getUser(session);
    const account = Account.update(userId, { ...user });
    const profile = Profile.update(userId, { ...user });
    const jwt = Jwt.authenticate(userId, auth);
    return { user: Merge.createUserMessage(await account, await profile, await jwt) };
  }

  @Router.get("/profiles/:username")
  async getProfile(session: WebSessionDoc, username: string) {
    const user = WebSession.getUser(session);
    const profile = await Profile.getProfileByUsername(username);
    const following = await Follower.isFollowing(user, profile._id);
    return { profile: Merge.createProfileMessage(profile, following) };
  }

  @Router.post("/profiles/:username/follow")
  async followProfile(session: WebSessionDoc, username: string) {
    const userId = WebSession.getUser(session);
    const profile = await Profile.getProfileByUsername(username);
    await Follower.create(userId, profile._id);
    return { profile: Merge.createProfileMessage(profile, true) };
  }

  @Router.delete("/profiles/:username/follow")
  async unfollowProfile(session: WebSessionDoc, username: string) {
    const userId = WebSession.getUser(session);
    const profile = await Profile.getProfileByUsername(username);
    await Follower.delete(userId, profile._id);
    return { profile: Merge.createProfileMessage(profile, false) };
  }

  @Router.post("/articles")
  async createArticle(session: WebSessionDoc, article: ArticleMessage) {
    const userId = WebSession.getUser(session);
    const profile = await Profile.getProfileById(userId);
    const newArticle = await Article.create(userId, article.title, article.description, article.body);
    if (article.tagList.length != 0) await Tag.create(newArticle._id, article.tagList);

    const profileMessage = Merge.createProfileMessage(profile, true);
    return { article: Merge.createArticleMessage(newArticle, profileMessage, article.tagList, false, 0) };
  }

  @Router.put("/articles/:slug")
  async updateArticle(session: WebSessionDoc, slug: string, article: ArticleMessage) {
    const userId = WebSession.getUser(session);
    const profile = await Profile.getProfileById(userId);
    const oldArticle = await Article.getBySlugOrThrow(slug);
    const newArticle = await Article.update(oldArticle._id, { title: article.title, description: article.description, body: article.body });
    await Tag.update(oldArticle._id, article.tagList);

    const profileMessage = Merge.createProfileMessage(profile, true);
    return { article: Merge.createArticleMessage(newArticle, profileMessage, article.tagList, false, 0) };
  }

  // TODO: this function needs the most refactoring
  // Router parsing breaks when you put default args
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
    // TODO: have to do manual filtering here (very bad)
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
        const profileMessage = Merge.createProfileMessage(profile, following);
        const favoritesCount = await Favorite.countTargetFavorites(article._id);
        const favorited = await Favorite.isFavoritedByUser(userId, article._id);
        const tagList = await Tag.getTagByTarget(article._id).then(Tag.stringify);
        return Merge.createArticleMessage(article, profileMessage, tagList, favorited, favoritesCount);
      }),
    );
    return { articles: articleMessages, articlesCount: articleMessages.length };
  }

  // TODO
  @Router.get("/articles/feed")
  async getFeedArticles(session: WebSessionDoc, limit: number, offset: number) {
    const userId = WebSession.getUser(session);

    // Get list of followed author IDs
    const followIds = await Follower.getFollowers(userId).then(Map.mapObjectIds);

    // Retrieve articles by followed authors, sorted by most recent first, with pagination
    const articles = await Article.getByAuthors(followIds, limit, offset);
    // Map articles to the desired message format
    const articleMessages = await Promise.all(
      articles.map(async (article) => {
        const profile = await Profile.getProfileById(article.author);
        const following = true; // The user is following the author by definition
        const profileMessage = Merge.createProfileMessage(profile, following);
        const favoritesCount = await Favorite.countTargetFavorites(article._id);
        const favorited = await Favorite.isFavoritedByUser(userId, article._id);
        const tagList = await Tag.getTagByTarget(article._id).then(Tag.stringify);
        return Merge.createArticleMessage(article, profileMessage, tagList, favorited, favoritesCount);
      }),
    );

    return { articles: articleMessages, articlesCount: articleMessages.length };
  }

  @Router.get("/articles/:slug")
  async getArticle(session: WebSessionDoc, slug: string) {
    const userId = WebSession.getUser(session);
    const article = await Article.getBySlugOrThrow(slug);

    if (article == null) throw new NotFoundError("article not found");

    const profile = await Profile.getProfileById(article?.author);
    const profileMessage = Merge.createProfileMessage(profile, true);
    const tagList = await Tag.stringify(await Tag.getTagByTarget(article._id));
    const favorited = await Favorite.isFavoritedByUser(userId, article._id);
    const favoriteCount = await Favorite.countTargetFavorites(article._id);
    return { article: Merge.createArticleMessage(article, profileMessage, tagList, favorited, favoriteCount) };
  }

  @Router.delete("/articles/:slug")
  async deleteArticle(slug: string) {
    // TODO: do user auth here (check jwtoken)
    const article = await Article.getBySlugOrThrow(slug);
    await Article.deleteBySlug(slug);
    await Comment.deleteByTarget(article._id);
    await Favorite.deleteByTarget(article._id);
    await Tag.deleteByTarget(article._id);
  }

  @Router.post("/articles/:slug/comments")
  async addComment(session: WebSessionDoc, comment: CommentDoc, slug: string) {
    const userId = WebSession.getUser(session);
    const article = await Article.getBySlugOrThrow(slug);
    const newComment = await Comment.create(userId, article?._id, comment.body);
    const profile = await Profile.getProfileById(userId);
    const profileMessage = Merge.createProfileMessage(profile, true);
    return { comment: Merge.createCommentMessage(newComment, profileMessage) };
  }

  @Router.get("/articles/:slug/comments")
  async getComments(session: WebSessionDoc, slug: string) {
    // TODO: fix typing here
    const userId = WebSession.getUser(session);
    const article = await Article.getBySlugOrThrow(slug);
    const comments = await Comment.getCommentsByTarget(article._id);
    const commentMessages = await Promise.all(
      comments.map(async (comment) => {
        const profile = await Profile.getProfileById(comment.author);
        const following = await Follower.isFollowing(userId, profile._id);
        const profileMessage = Merge.createProfileMessage(profile, following);
        return Merge.createCommentMessage(comment, profileMessage);
      }),
    );

    return { comments: commentMessages };
  }

  @Router.delete("/articles/:slug/comments/:id")
  async deleteComment(slug: string, id: string) {
    await Comment.delete(new ObjectId(id));
  }

  @Router.post("/articles/:slug/favorite")
  async favoriteArticle(session: WebSessionDoc, slug: string) {
    const userId = WebSession.getUser(session);
    const article = await Article.getBySlugOrThrow(slug);
    const profile = await Profile.getProfileById(article.author);
    const following = await Follower.isFollowing(userId, profile._id);
    const profileMessage = Merge.createProfileMessage(profile, following);
    await Favorite.create(userId, article?._id);
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const tagList = Tag.stringify(await Tag.getTagByTarget(article._id));
    return { article: Merge.createArticleMessage(article, profileMessage, tagList, true, favoritesCount) };
  }

  @Router.delete("/articles/:slug/favorite")
  async unfavoriteArticle(session: WebSessionDoc, slug: string) {
    const userId = WebSession.getUser(session);
    const article = await Article.getBySlugOrThrow(slug);
    const profile = await Profile.getProfileById(article.author);
    const following = await Follower.isFollowing(userId, profile._id);
    const profileMessage = Merge.createProfileMessage(profile, following);
    await Favorite.delete(userId, article?._id);
    const favoritesCount = await Favorite.countTargetFavorites(article._id);
    const tagList = Tag.stringify(await Tag.getTagByTarget(article._id));
    return { article: Merge.createArticleMessage(article, profileMessage, tagList, false, favoritesCount) };
  }

  @Router.get("/tags")
  async getTags() {
    return { tags: Tag.stringify(await Tag.getTags({})) };
  }
}

export const routes = new Routes();
export default getExpressRouter(routes);
