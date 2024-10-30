import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

export interface ArticleDoc extends BaseDoc {
  author: ObjectId;
  slug: string;
  title: string;
  description: string;
  body: string;
}

export default class ArticleConcept {
  public readonly articles: DocCollection<ArticleDoc>;

  constructor(name: string) {
    this.articles = new DocCollection<ArticleDoc>(name);
  }

  async create(author: ObjectId, title: string, description: string, body: string) {
    const _id = await this.articles.createOne({ author, slug: "", title, description, body });
    return { msg: "Article successfully created!", article: await this.articles.readOne({ _id }) };
  }

  async getArticles() {
    // Returns all articles! You might want to page for better client performance
    return await this.articles.readMany({}, { sort: { _id: -1 } });
  }

  async getByAuthor(author: ObjectId) {
    return await this.articles.readMany({ author });
  }

  async getBySlug(slug: string) {
    return await this.articles.readOne({ slug });
  }

  async update(_id: ObjectId, updates: Partial<ArticleDoc>) {
    await this.articles.partialUpdateOne({ _id }, { ...updates });
    return { msg: "Article successfully updated!" };
  }

  async deleteBySlug(slug: String) {
    await this.articles.deleteOne({ slug });
    return { msg: "Article deleted successfully!" };
  }

  async assertAuthorIsUser(_id: ObjectId, user: ObjectId) {
    const article = await this.articles.readOne({ _id });
    if (!article) {
      throw new NotFoundError(`Article ${_id} does not exist!`);
    }
    if (article.author.toString() !== user.toString()) {
      throw new NotAllowedError(`User ${user} is not author of article ${_id}`);
    }
  }
}
