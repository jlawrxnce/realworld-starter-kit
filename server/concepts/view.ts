import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";

export interface ViewDoc extends BaseDoc {
  contentId: ObjectId;
  viewerId: ObjectId;
  timestamp: Date;
}

export default class ViewConcept {
  public readonly views: DocCollection<ViewDoc>;

  constructor(collectionName: string) {
    this.views = new DocCollection<ViewDoc>(collectionName);
  }

  async create(contentId: ObjectId, viewerId: ObjectId) {
    const existingView = await this.views.readOne({ contentId, viewerId });
    if (existingView) {
      return existingView;
    }
    const _id = await this.views.createOne({ contentId, viewerId, timestamp: new Date() });
    return await this.views.readOne({ _id });
  }

  async getViewCount(contentId: ObjectId) {
    return await this.views.count({ contentId });
  }

  async countByTarget(contentId: ObjectId) {
    return await this.views.count({ contentId });
  }

  async getViewsByViewer(viewerId: ObjectId) {
    return await this.views.readMany({ viewerId });
  }
}
