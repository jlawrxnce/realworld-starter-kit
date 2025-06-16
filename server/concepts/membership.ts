import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError } from "./errors";

export enum Tier {
  Free = "Free",
  Trial = "Trial",
  Gold = "Gold",
}

export interface MembershipDoc extends BaseDoc {
  owner: ObjectId;
  tier: Tier;
  renewalDate: Date;
  autoRenew: boolean;
  totalRevenue: number;
  startDate: Date;
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
    const now = new Date();
    const renewalDate = new Date(now);
    if (tier === Tier.Trial) {
      renewalDate.setDate(now.getDate() + 7);
    } else {
      renewalDate.setDate(now.getDate() + 30);
    }
    const _id = await this.memberships.createOne({
      owner,
      tier,
      renewalDate,
      autoRenew: false,
      totalRevenue: 0,
      startDate: now,
    });
    return await this.memberships.readOne({ _id });
  }

  async getMembership(owner: ObjectId) {
    const membership = await this.memberships.readOne({ owner });
    if (!membership) {
      // Return a default free membership
      const now = new Date();
      return { owner, tier: Tier.Free, renewalDate: now, autoRenew: false, totalRevenue: 0, startDate: now };
    }
    return membership;
  }

  async update(owner: ObjectId, updates: Partial<MembershipDoc>) {
    const membership = await this.memberships.readOne({ owner });
    if (!membership) {
      return null;
    }

    await this.memberships.partialUpdateOne({ owner }, { ...updates });
    return await this.memberships.readOne({ owner });
  }

  async verifyMembershipAccess(owner: ObjectId) {
    const membership = await this.getMembership(owner);
    return membership.tier !== Tier.Free;
  }
}
