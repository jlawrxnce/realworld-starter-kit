import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";

export interface ViewDoc extends BaseDoc {
  viewer: ObjectId; // User who viewed the content
  target: ObjectId; // Content being viewed (article/profile)
  timestamp: Date;
}

export default class ViewConcept {
  public readonly views: DocCollection<ViewDoc>;

  constructor(name: string) {
    this.views = new DocCollection<ViewDoc>(name);
  }

  async create(viewer: ObjectId, target: ObjectId) {
    const existingView = await this.views.readOne({ viewer, target });
    if (!existingView) {
      const _id = await this.views.createOne({ viewer, target, timestamp: new Date() });
      return await this.views.readOne({ _id });
    }
    return existingView;
  }

  async getViewCount(target: ObjectId) {
    return await this.views.count({ target });
  }

  async getViewsByViewer(viewer: ObjectId) {
    return await this.views.readMany({ viewer });
  }
}
