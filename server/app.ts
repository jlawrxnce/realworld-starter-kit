import FollowerConcept from "./concepts/follower";
import AccountConcept from "./concepts/account";
import ProfileConcept from "./concepts/profile";
import ArticleConcept from "./concepts/article";
import CommentConcept from "./concepts/comment";
import FavoriteConcept from "./concepts/favorite";
import TagConcept from "./concepts/tags";
import { MergeConcept } from "./concepts/operational/merge";
import MapperConcept from "./concepts/operational/mapper";
import JwtConcept from "./concepts/jwt";

// App Definition using concepts
export const Account = new AccountConcept("account");
export const Profile = new ProfileConcept("profile");
export const Follower = new FollowerConcept("followers");
export const Article = new ArticleConcept("articles");
export const Comment = new CommentConcept("comments");
export const Favorite = new FavoriteConcept("favorites");
export const Tag = new TagConcept("tags");
export const Jwt = new JwtConcept();

export const Merge = new MergeConcept();
export const Map = new MapperConcept();
