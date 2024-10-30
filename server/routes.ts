import type { ArticleMessage, User } from "types/types";
import { Account, Article, Follower, Profile, WebSession } from "./app";
import { WebSessionDoc } from "./concepts/websession";
import { Router, getExpressRouter } from "./framework/router";

class Routes {
  @Router.get("/session")
  async getSessionUser(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    return user;
  }

  @Router.post("/users")
  async register(session: WebSessionDoc, user: User) {
    WebSession.isLoggedOut(session);
    // TODO: types aren't consistent currently
    const account = await Account.create(user.username, user.password, user.email);
    if (account.user) {
      await Profile.create(account.user._id, user.username, user.bio ?? "", user.image ?? "");
      WebSession.start(session, account.user._id);
    }
    return "";
  }

  @Router.post("/users/login")
  async login(session: WebSessionDoc, user: User) {
    WebSession.isLoggedOut(session);
    const account = await Account.authenticate(user.email, user.password);
    WebSession.start(session, account._id);
  }

  @Router.get("/user")
  async getUser(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    await Account.getAccountById(user);
    return await Profile.getProfileById(user);
  }

  @Router.put("/user")
  async updateUser(session: WebSessionDoc, user: User) {
    const _id = WebSession.getUser(session);
    // TODO: do auth on user
    // TODO: need to validate input
    await Account.update(_id, user.username, user.password, user.email);
    // TODO: profile update broken
    await Profile.update(_id, { username: user.username, bio: user.bio, image: user.image });
  }

  @Router.get("/profiles/:username")
  async getProfile(session: WebSessionDoc, username: string) {
    return await Profile.getProfileByUsername(username);
  }

  @Router.post("/profiles/:username/follow")
  async followProfile(session: WebSessionDoc, username: string) {
    const userId = WebSession.getUser(session);
    const target = await Account.getAccountByUsername(username);
    // get targetId
    await Follower.create(userId, target._id);
  }

  @Router.delete("/profiles/:username/follow")
  async unfollowProfile(session: WebSessionDoc, username: string) {
    const userId = WebSession.getUser(session);
    const target = await Account.getAccountByUsername(username);
    // get targetId
    await Follower.delete(userId, target._id);
  }

  @Router.post("/articles")
  async createArticle(session: WebSessionDoc, article: ArticleMessage) {
    const userId = WebSession.getUser(session);
    await Article.create(userId, article.title, article.description, article.body);
  }

  @Router.delete("/articles/:slug")
  async deleteArticle(session: WebSessionDoc, slug: string) {
    // TODO: do user auth here
    Article.deleteBySlug(slug);
  }
}

export const routes = new Routes();
export default getExpressRouter(routes);
