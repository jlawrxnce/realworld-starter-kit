import { Filter, ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";

export interface FollowerDoc extends BaseDoc {
  userId: ObjectId;
  target: ObjectId;
}

export default class FollowerConcept {
  public readonly followers: DocCollection<FollowerDoc>;
  // TODO: generate inverse
  private readonly follows: Map<ObjectId, Array<ObjectId>>;

  constructor(name: string) {
    // initialize statee
    this.followers = new DocCollection<FollowerDoc>(name);
    this.follows = new Map<ObjectId, Array<ObjectId>>();
  }

  async create(userId: ObjectId, target: ObjectId) {
    const _id = await this.followers.createOne({ userId, target });
    return { msg: "Comment successfully created!", follower: await this.followers.readOne({ _id }) };
  }

  async delete(_id: ObjectId, targetId: ObjectId) {
    await this.followers.deleteOne({ _id, targetId });
    return { msg: "Comment deleted successfully!" };
  }

  async getFollowers(query: Filter<FollowerDoc>) {
    const comments = await this.followers.readMany(query, {
      sort: { dateUpdated: -1 },
    });
    return comments;
  }

  async getFollowersByUserId(userId: ObjectId) {
    return await this.getFollowers({ userId });
  }

  async getFollowsByUserId(target: ObjectId) {
    return await this.getFollowers({ target });
  }
}
