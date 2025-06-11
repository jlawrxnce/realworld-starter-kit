import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError } from "./errors";

export enum Tier {
  Free = "Free",
  Silver = "Silver",
  Gold = "Gold",
}

export interface MembershipDoc extends BaseDoc {
  owner: ObjectId;
  tier: Tier;
  renewalDate: Date;
  autoRenew: boolean;
  totalRevenue: number;
}

export default class MembershipConcept {
  public readonly memberships: DocCollection<MembershipDoc>;

  constructor(name: string) {
    this.memberships = new DocCollection<MembershipDoc>(name);
  }

  async create(owner: ObjectId, tier: Tier) {
    if (tier === Tier.Free) {
      throw new BadValuesError("Cannot create membership with Free tier");
    }
    const existing = await this.memberships.readOne({ owner });
    if (existing) {
      throw new BadValuesError("User already has a membership");
    }
    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + 1);
    const _id = await this.memberships.createOne({ owner, tier, renewalDate, autoRenew: false, totalRevenue: 0 });
    return await this.memberships.readOne({ _id });
  }

  async getMembership(owner: ObjectId) {
    const membership = await this.memberships.readOne({ owner });
    if (!membership) {
      // Return a default free membership
      const now = new Date();
      return { owner, tier: Tier.Free, renewalDate: now, autoRenew: false, totalRevenue: 0 };
    }
    return membership;
  }

  async update(owner: ObjectId, updates: Partial<MembershipDoc>) {
    const membership = await this.memberships.readOne({ owner });
    if (!membership) {
      return null;
    }
    const renewalDate = new Date(membership.renewalDate);
    if (updates.tier !== undefined && updates.tier !== membership.tier) {
      renewalDate.setMonth(renewalDate.getMonth() + 1);
    }
    await this.memberships.partialUpdateOne({ owner }, { ...updates, renewalDate });
    return await this.memberships.readOne({ owner });
  }

  async verifyMembershipAccess(owner: ObjectId) {
    const membership = await this.getMembership(owner);
    return membership.tier !== Tier.Free;
  }
}
