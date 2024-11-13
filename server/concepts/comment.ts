import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { NotFoundError } from "./errors";

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

  async create(author: ObjectId, target: ObjectId, body: string) {
    const _id = await this.comments.createOne({ author, target, body });
    const comment = await this.comments.readOne({ _id });
    if (comment == null) throw new NotFoundError("New comment creation was unsuccessful");
    return comment;
  }

  async delete(_id: ObjectId) {
    await this.comments.deleteOne({ _id });
    return { msg: "Comment deleted successfully!" };
  }

  async deleteByTarget(target: ObjectId) {
    await this.comments.deleteMany({ target });
    return { msg: "Comments deleted successfully!" };
  }

  async getCommentsByTarget(target: ObjectId) {
    return await this.comments.readMany({ target });
  }
}
