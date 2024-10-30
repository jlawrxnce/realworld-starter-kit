export interface User {
  username: string;
  email: string;
  password: string;
  bio?: string;
  image?: string;
}

export interface ArticleMessage {
  title: string;
  description: string;
  body: string;
  tagList: string[];
}
