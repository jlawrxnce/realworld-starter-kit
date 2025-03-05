import { AccountDoc } from "concepts/account";
import { ArticleDoc } from "concepts/article";
import { CommentDoc } from "concepts/comment";
import { ProfileDoc } from "concepts/profile";
import { ArticleResponse, CommentResponse, ProfileResponse, UserResponse } from "types/types";

export default class MergeConcept {
  createUserResponse(account: AccountDoc, profile: ProfileDoc, token: string): UserResponse {
    // TODO: builder would be helpful for these functions
    return { username: account.username, email: account.email, token: token, bio: profile.bio, image: profile.image };
  }

  createProfileResponse(profile: ProfileDoc, following: boolean): ProfileResponse {
    return { username: profile.username, bio: profile.bio ?? "", image: profile.image ?? "", following };
  }

  createArticleResponse(article: ArticleDoc, author: ProfileResponse, tagList: Array<string>, favorited: boolean, favoritesCount: number): ArticleResponse {
    return {
      ...article,
      favorited,
      favoritesCount,
      tagList,
      author,
    };
  }

  createCommentResponse(comment: CommentDoc, profile: ProfileResponse): CommentResponse {
    const { target, _id: id, ...rest } = comment;
    return { ...rest, id, author: { ...profile } };
  }
}
