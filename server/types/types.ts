export type UserRequest = {
  email: string;
  username: string;
  password: string;
  image: string;
  bio: string;
  token?: string;
  hasPaywall?: boolean;
};

export type ArticleRequest = {
  title: string;
  description: string;
  body: string;
  tagList?: Array<string>;
  hasPaywall?: boolean;
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
  hasPaywall: boolean;
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

export enum Tier {
  Free = "Free",
  Silver = "Silver",
  Gold = "Gold",
}

export type MembershipRequest = {
  tier: Tier;
  autoRenew: boolean;
};

export type MembershipResponse = {
  username: string;
  tier: Tier;
  renewalDate: string;
  autoRenew: boolean;
  totalRevenue: number;
};
