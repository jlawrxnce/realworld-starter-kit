import { Filter, ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";

export interface TagDoc extends BaseDoc {
  target: ObjectId;
  content: string;
}

export default class TagConcept {
  public readonly tags: DocCollection<TagDoc>;
  // TODO: generate inverse
  private readonly follows: Map<ObjectId, Array<ObjectId>>;

  constructor(name: string) {
    // initialize statee
    this.tags = new DocCollection<TagDoc>(name);
    this.follows = new Map<ObjectId, Array<ObjectId>>();
  }

  async create(target: ObjectId, tags: Array<string>) {
    await Promise.all(tags.map((tag: string) => this.tags.createOne({ content: tag, target })));
    return this.tags.readMany({ target });
  }

  async update(target: ObjectId, tags: Array<string>) {
    // wipe old tags and make new ones
    await this.deleteByTarget(target);
    return await this.create(target, tags);
  }

  async deleteByTarget(targetId: ObjectId) {
    await this.tags.deleteMany({ targetId });
    return { msg: "Comment deleted successfully!" };
  }

  async getTags(query: Filter<TagDoc>) {
    const tags = await this.tags.readMany(query);
    return tags.reverse();
  }

  async getTagByTarget(target: ObjectId) {
    return await this.getTags({ target });
  }

  async getTagByContent(content: string) {
    return await this.getTags({ content });
  }

  stringify(tagList: Array<TagDoc>) {
    return tagList.map((tag) => tag.content);
  }
}
