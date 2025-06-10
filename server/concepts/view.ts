import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError } from "./errors";

export interface ViewDoc extends BaseDoc {
  target: ObjectId;
  viewer: ObjectId;
  timestamp: Date;
  type: "Article" | "Profile";
}

export default class ViewConcept {
  public readonly views: DocCollection<ViewDoc>;

  constructor(name: string) {
    this.views = new DocCollection<ViewDoc>(name);
  }

  async create(target: ObjectId, viewer: ObjectId, type: "Article" | "Profile") {
    // Check if view already exists in the last 24 hours
    const existingView = await this.views.readOne({
      target,
      viewer,
      type,
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (existingView) {
      throw new BadValuesError("Already viewed in the last 24 hours");
    }

    const _id = await this.views.createOne({ target, viewer, type, timestamp: new Date() });
    return await this.views.readOne({ _id });
  }

  async getViewCount(target: ObjectId, type: "Article" | "Profile") {
    return await this.views.count({
      target,
      type,
    });
  }

  async getViewsByViewer(viewer: ObjectId) {
    return await this.views.readMany({ viewer });
  }

  async getViewsByTarget(target: ObjectId) {
    return await this.views.readMany({ target });
  }
}
