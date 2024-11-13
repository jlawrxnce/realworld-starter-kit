import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError, NotAllowedError, NotFoundError } from "./errors";
import { UserMessage } from "types/types";

// TODO: separate out email
export interface AccountDoc extends BaseDoc {
  username: string;
  password?: string;
  email: string;
}

export default class AccountConcept {
  public readonly accounts: DocCollection<AccountDoc>;

  constructor(name: string) {
    this.accounts = new DocCollection<AccountDoc>(name);
  }

  async create(username: string, password: string, email: string) {
    await this.assertGoodCredentials(username, password, email);
    const _id = await this.accounts.createOne({ username, password, email });
    const account = await this.accounts.readOne({ _id });

    if (!account) throw new NotFoundError("Account not created");
    return this.sanitizeUser(account);
  }

  async authenticate(email: string, password: string) {
    const user = await this.accounts.readOne({ email, password });
    if (!user) {
      throw new NotAllowedError("Email or password is incorrect.");
    }
    return user._id;
  }

  async getAccountById(_id: ObjectId) {
    const account = await this.accounts.readOne({ _id });
    if (account === null) {
      throw new NotFoundError(`User not found!`);
    }
    return this.sanitizeUser(account);
  }

  async getAccountByUsername(username: string) {
    const account = await this.accounts.readOne({ username });
    if (account === null) {
      throw new NotFoundError(`User not found!`);
    }
    return this.sanitizeUser(account);
  }

  async update(_id: ObjectId, updates: Partial<UserMessage>) {
    if (updates.username) await this.updateUsername(_id, updates.username);
    if (updates.password) await this.updatePassword(_id, updates.password);
    if (updates.email) await this.updateEmail(_id, updates.email);
    return this.getAccountById(_id);
  }

  private async updateUsername(_id: ObjectId, username: string) {
    // await this.assertUnique("username", username);
    await this.accounts.partialUpdateOne({ _id }, { username });
    return { msg: "Username updated successfully!" };
  }

  private async updateEmail(_id: ObjectId, email: string) {
    // await this.assertUnique("email", email);
    await this.accounts.partialUpdateOne({ _id }, { email });
    return { msg: "email updated successfully!" };
  }

  private async updatePassword(_id: ObjectId, newPassword: string) {
    const account = await this.accounts.readOne({ _id });
    if (!account) {
      throw new NotFoundError("User not found");
    }

    await this.accounts.partialUpdateOne({ _id }, { password: newPassword });
    return { msg: "Password updated successfully!" };
  }

  private async assertGoodCredentials(username: string, password: string, email: string) {
    if (!username || !password || !email) {
      throw new BadValuesError("Username, password, and email must be non-empty!");
    }
    await this.assertUnique("username", username);
    await this.assertUnique("email", email);
  }

  private async assertUnique(field: string, value: string) {
    if (await this.accounts.readOne({ [field]: value })) {
      throw new NotAllowedError(`User with ${field} ${value} already exists!`);
    }
  }

  private sanitizeUser(account: AccountDoc) {
    // eslint-disable-next-line
    const { password, ...rest } = account; // remove password
    return rest;
  }
}
