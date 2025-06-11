import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError } from "./errors";

export enum Tier {
  Free = "Free",
  Gold = "Gold",
}

export interface MembershipDoc extends BaseDoc {
  user: ObjectId;
  tier: Tier;
  renewalDate: Date;
  autoRenew: boolean;
}

export default class MembershipConcept {
  public readonly memberships: DocCollection<MembershipDoc>;

  constructor(name: string) {
    this.memberships = new DocCollection<MembershipDoc>(name);
  }

  async create(user: ObjectId, tier: Tier) {
    if (tier === Tier.Free) {
      throw new BadValuesError("Cannot create membership with Free tier");
    }

    const existingMembership = await this.memberships.readOne({ user });
    if (existingMembership) {
      throw new BadValuesError("User already has a membership");
    }

    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + 1); // Set renewal date to 1 month from now

    const _id = await this.memberships.createOne({ user, tier, renewalDate, autoRenew: false });
    return await this.memberships.readOne({ _id });
  }

  async getMembership(user: ObjectId) {
    const membership = await this.memberships.readOne({ user });
    if (!membership) {
      // Return default free membership
      return {
        user,
        tier: Tier.Free,
        renewalDate: new Date(),
        autoRenew: false,
      };
    }
    return membership;
  }

  async update(user: ObjectId, update: Partial<MembershipDoc>) {
    const membership = await this.memberships.readOne({ user });
    if (!membership) {
      throw new BadValuesError("User does not have an active membership to update");
    }

    await this.memberships.partialUpdateOne({ user }, update);
    return await this.memberships.readOne({ user });
  }

  async isGoldMember(user: ObjectId) {
    const membership = await this.getMembership(user);
    return membership.tier === Tier.Gold;
  }
}
