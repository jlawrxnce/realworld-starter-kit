import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError, NotAllowedError, NotFoundError } from "./errors";

// TODO: separate out email
export interface AccountDoc extends BaseDoc {
  username: string;
  password: string;
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
    return { msg: "User created successfully!", user: await this.accounts.readOne({ _id }) };
  }

  async authenticate(email: string, password: string) {
    const user = await this.accounts.readOne({ email, password });
    if (!user) {
      throw new NotAllowedError("Email or password is incorrect.");
    }
    return { msg: "Successfully authenticated.", _id: user._id };
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

  async update(_id: ObjectId, username: string, email: string, password: string) {
    // TODO: make this more scalable
    if (username) await this.updateUsername(_id, username);
    if (password) await this.updatePassword(_id, password);
    if (email) await this.updateEmail(_id, email);
  }

  private async updateUsername(_id: ObjectId, username: string) {
    await this.assertUsernameUnique(username);
    await this.accounts.partialUpdateOne({ _id }, { username });
    return { msg: "Username updated successfully!" };
  }

  private async updateEmail(_id: ObjectId, email: string) {
    await this.accounts.partialUpdateOne({ _id }, { email });
    return { msg: "Username updated successfully!" };
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
    await this.assertUsernameUnique(username);
  }

  private async assertUsernameUnique(username: string) {
    if (await this.accounts.readOne({ username })) {
      throw new NotAllowedError(`User with username ${username} already exists!`);
    }
  }

  private sanitizeUser(account: AccountDoc) {
    // eslint-disable-next-line
    const { password, ...rest } = account; // remove password
    return rest;
  }
}
