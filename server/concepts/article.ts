import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError, NotAllowedError, NotFoundError } from "./errors";

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
    // TODO: check for title uniqueness
    const slug = await this.generateSlug(title);
    if ((await this.getBySlug(slug)) != null) throw new BadValuesError("Title already exists");
    const _id = await this.articles.createOne({ author, slug, title, description, body });
    const article = await this.articles.readOne({ _id });
    if (article == null) throw new NotFoundError("New article was not made");
    return article;
  }

  async getArticles() {
    // Returns all articles! You might want to page for better client performance
    return await this.articles.readMany({}, { sort: { createdAt: -1 } });
  }

  async getByAuthors(authorId: ObjectId[], limit = 10, offset = 0) {
    // Filter articles by authors the user follows, apply sorting, pagination, and re-sort to chronological order
    const articles: Array<ArticleDoc> = await this.articles.readMany(
      { authorId: { $in: authorId } },
      {
        sort: { createdAt: -1 },
        skip: offset,
        limit: limit,
      },
    );

    return articles;
  }

  async getByAuthor(author: ObjectId) {
    return await this.articles.readMany({ author }, { sort: { _id: -1 } });
  }

  async getBySlug(slug: string) {
    const article = await this.articles.readOne({ slug });
    return article;
  }

  async getBySlugOrThrow(slug: string) {
    const article = await this.getBySlug(slug);
    if (article == null) throw new NotFoundError("article does not exist");
    return article;
  }

  async update(_id: ObjectId, updates: Partial<ArticleDoc>) {
    await this.articles.partialUpdateOne({ _id }, { ...updates });
    const article = await this.articles.readOne({ _id });
    if (article == null) throw new NotFoundError("Article was not properly updated");
    return article;
  }

  async deleteBySlug(slug: String) {
    const _id = await this.articles.deleteOne({ slug });
    return _id;
  }

  private async assertAuthorIsUser(_id: ObjectId, user: ObjectId) {
    const article = await this.articles.readOne({ _id });
    if (!article) {
      throw new NotFoundError(`Article ${_id} does not exist!`);
    }
    if (article.author.toString() !== user.toString()) {
      throw new NotAllowedError(`User ${user} is not author of article ${_id}`);
    }
  }

  // taken from https://dev.to/bybydev/how-to-slugify-a-string-in-javascript-4o9n
  private async generateSlug(title: string) {
    title = title.replace(/^\s+|\s+$/g, ""); // trim leading/trailing white space
    title = title.toLowerCase(); // convert string to lowercase
    title = title
      .replace(/[^a-z0-9 -]/g, "") // remove any non-alphanumeric characters
      .replace(/\s+/g, "-") // replace spaces with hyphens
      .replace(/-+/g, "-"); // remove consecutive hyphens
    return title;
  }
}
