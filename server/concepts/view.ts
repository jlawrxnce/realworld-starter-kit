import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";

export interface ViewDoc extends BaseDoc {
  viewer: ObjectId; // User who viewed the content
  target: ObjectId; // Content being viewed (article/profile)
  author: ObjectId; // Author of the content (for tracking views on authored content)
  timestamp: Date;
  isArticleView: boolean; // Whether this is a view on an article (true) or profile (false)
}

export default class ViewConcept {
  public readonly views: DocCollection<ViewDoc>;

  constructor(name: string) {
    this.views = new DocCollection<ViewDoc>(name);
  }

  async create(viewer: ObjectId, target: ObjectId, author: ObjectId, isArticleView: boolean) {
    // Always create a new view record to track all views
    const _id = await this.views.createOne({ viewer, target, author, timestamp: new Date(), isArticleView });
    return await this.views.readOne({ _id });
  }

  async getViewCount(target: ObjectId) {
    return await this.views.count({ target });
  }

  async getViewsByViewer(viewer: ObjectId) {
    return await this.views.readMany({ viewer });
  }
  async getTotalArticleViewsForAuthor(author: ObjectId) {
    return await this.views.count({ author, isArticleView: true });
  }
}
