import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError, UnprocessableEntityError } from "./errors";

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
}

export default class MembershipConcept {
  public readonly memberships: DocCollection<MembershipDoc>;

  constructor(collectionName: string) {
    this.memberships = new DocCollection<MembershipDoc>(collectionName);
  }

  async create(owner: ObjectId) {
    const _id = await this.memberships.createOne({ owner, tier: Tier.Free, renewalDate: new Date(), autoRenew: false });
    return await this.memberships.readOne({ _id });
  }

  async getByOwner(owner: ObjectId) {
    const membership = await this.memberships.readOne({ owner });
    if (!membership) {
      return { owner, tier: Tier.Free, autoRenew: false, renewalDate: new Date() };
    }
    return membership;
  }

  async updateMembership(owner: ObjectId, updates: Partial<MembershipDoc>) {
    console.log("updates", updates);
    const membership = await this.getByOwner(owner);
    if (membership.tier === Tier.Free) {
      throw new NotAllowedError("Free users cannot update membership!");
    }
    console.log("membership", membership, updates);
    await this.memberships.partialUpdateOne({ owner }, updates);
    const updatedMembership = await this.getByOwner(owner);
    console.log("updatedMembership", updatedMembership);
    if (!updatedMembership) {
      throw new NotFoundError("Membership not found!");
    }
    return updatedMembership;
  }

  async activateMembership(owner: ObjectId, tier: Tier) {
    if (tier === Tier.Free) {
      throw new UnprocessableEntityError("Cannot activate Free tier membership!");
    }
    await this.memberships.deleteOne({ owner });
    const _id = await this.memberships.createOne({ owner, tier, autoRenew: false, renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
    return await this.memberships.readOne({ _id });
  }

  async hasTierAccess(owner: ObjectId, requiredTier: Tier) {
    try {
      const membership = await this.getByOwner(owner);
      if (requiredTier === Tier.Free) return true;
      return membership.tier === requiredTier;
    } catch {
      return requiredTier === Tier.Free; // If no membership found, only allow Free tier access
    }
  }
}
