export type UserRequest = {
  email: string;
  username: string;
  password: string;
  image: string;
  bio: string;
};

export type ArticleRequest = {
  title: string;
  description: string;
  body: string;
  tagList?: Array<string>;
  isPremium?: boolean;
};

export type CommentRequest = {
  body: string;
};

export type UserResponse = {
  email: string;
  token: string;
  username: string;
  bio: string;
  image: string | null;
};

export type ProfileResponse = {
  username: string;
  bio: string;
  image: string;
  following: boolean;
};

export type ArticleResponse = {
  slug: string;
  title: string;
  description: string;
  body?: string;
  tagList: string[];
  createdAt: string;
  updatedAt: string;
  favorited: boolean;
  favoritesCount: number;
  author: ProfileResponse;
};

export type ArticlesResponse = {
  articles: Array<ArticleResponse>;
  articlesCount: number;
};

export type CommentResponse = {
  id: number;
  createdAt: string;
  updatedAt: string;
  body: string;
  author: ProfileResponse;
};

export type CommentsResponse = {
  comments: Array<CommentResponse>;
};

export type TagsResponse = {
  tags: Array<String>;
};
