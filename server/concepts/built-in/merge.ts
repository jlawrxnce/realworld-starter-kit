import { AccountDoc } from "concepts/account";
import { ArticleDoc } from "concepts/article";
import { CommentDoc } from "concepts/comment";
import { ProfileDoc } from "concepts/profile";
import { ArticleMessage, CommentMessage, ProfileMessage, UserMessage } from "types/types";

export default class MergeConcept {
  createUserMessage(account: AccountDoc, profile: ProfileDoc, token: string): UserMessage {
    // TODO: builder would be helpful for these functions
    return { username: account.username, email: account.email, token: token, bio: profile.bio, image: profile.image };
  }

  createProfileMessage(profile: ProfileDoc, following: boolean): ProfileMessage {
    return { username: profile.username, bio: profile.bio ?? "", image: profile.image ?? "", following };
  }

  createArticleMessage(article: ArticleDoc, author: ProfileMessage, tagList: Array<string>, favorited: boolean, favoritesCount: number): ArticleMessage {
    return {
      ...article,
      favorited,
      favoritesCount,
      tagList,
      author,
    };
  }

  createCommentMessage(comment: CommentDoc, profile: ProfileMessage): CommentMessage {
    const { target, _id: id, ...rest } = comment;
    return { ...rest, id, author: { ...profile } };
  }
}
