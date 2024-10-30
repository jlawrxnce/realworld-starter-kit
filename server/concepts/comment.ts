import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";

export interface CommentDoc extends BaseDoc {
  author: ObjectId;
  target: ObjectId;
  body: string;
}

export default class CommentConcept {
  public readonly comments: DocCollection<CommentDoc>;

  constructor(name: string) {
    this.comments = new DocCollection<CommentDoc>(name);
  }

  async create(author: ObjectId, target: ObjectId, body: string) {}

  async delete(_id: ObjectId) {}

  async getCommentsByTarget(target: ObjectId) {}
}
