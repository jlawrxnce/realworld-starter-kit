import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotFoundError } from "./errors";

export interface ProfileDoc extends BaseDoc {
  username: string;
  bio: string;
  image: string;
}

export default class ProfileConcept {
  public readonly profiles: DocCollection<ProfileDoc>;

  constructor(name: string) {
    this.profiles = new DocCollection<ProfileDoc>(name);
  }

  async create(_id: ObjectId, username: string, bio: string, image: string) {
    // TODO: use the _id generated by the account entry
    await this.profiles.createOne({ _id, username, bio, image }, false);
    const profile = await this.profiles.readOne({ _id });
    if (!profile) throw new NotFoundError("Account not created");
    return profile;
  }

  async getProfileById(_id: ObjectId) {
    const profile = await this.profiles.readOne({ _id });
    if (profile === null) {
      throw new NotFoundError(`User not found!`);
    }
    return profile;
  }

  async getProfileByUsername(username: string) {
    const profile = await this.profiles.readOne({ username });
    if (profile === null) {
      throw new NotFoundError(`User not found!`);
    }
    return profile;
  }

  async update(_id: ObjectId, updates: Partial<ProfileDoc>) {
    await this.profiles.partialUpdateOne({ _id }, { ...updates });
    return this.getProfileById(_id);
  }
}