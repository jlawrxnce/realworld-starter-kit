import { ObjectId } from "mongodb";

export interface UserMessage {
  username: string;
  email: string;
  password?: string;
  token?: string;
  bio: string;
  image: string;
}

export interface ProfileMessage {
  username: string;
  bio: string;
  image: string;
  following: boolean;
}

export interface ArticleBase {
  slug: string;
  title: string;
  tagList: string[];
  description: string;
  createdAt: string;
  updatedAt: string;
  favorited: boolean;
  favoritesCount: number;
  author: ProfileMessage;
}

export interface ArticleMessage extends ArticleBase {
  body: string;
}

export interface ArticlesMessage {
  articles: Array<ArticleBase>;
  articlesCount: number;
}

export interface CommentMessage {
  id: ObjectId;
  createdAt: string;
  updatedAt: string;
  body: string;
  author: ProfileMessage;
}

export interface CommentsMessage {
  comments: Array<CommentMessage>;
}

export interface TagsMessage {
  tags: Array<String>;
}
