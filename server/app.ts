import FollowerConcept from "./concepts/follower";
import AccountConcept from "./concepts/account";
import ProfileConcept from "./concepts/profile";
import WebSessionConcept from "./concepts/websession";
import ArticleConcept from "./concepts/article";

// App Definition using concepts
export const WebSession = new WebSessionConcept();
export const Account = new AccountConcept("account");
export const Profile = new ProfileConcept("profile");
export const Follower = new FollowerConcept("followers");
export const Article = new ArticleConcept("articles");
