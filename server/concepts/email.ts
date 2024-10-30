import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";

export interface EmailDoc extends BaseDoc {
  username: ObjectId;
  email: string;
}

export default class EmailConcept {
  public readonly emails: DocCollection<EmailDoc>;

  constructor(name: string) {
    this.emails = new DocCollection<EmailDoc>(name);
  }

  async create(username: ObjectId, email: string) {}

  async auth(username: ObjectId, email: string) {}

  async notify(email: string) {}
}
