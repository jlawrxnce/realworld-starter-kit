import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError, UnprocessableEntityError } from "./errors";

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
  lastActiveMembership?: Date;
}

export default class MembershipConcept {
  public readonly memberships: DocCollection<MembershipDoc>;

  constructor(collectionName: string) {
    this.memberships = new DocCollection<MembershipDoc>(collectionName);
  }

  async create(owner: ObjectId) {
    const _id = await this.memberships.createOne({ owner, tier: Tier.Free, renewalDate: new Date(), autoRenew: false, lastActiveMembership: undefined });
    return await this.memberships.readOne({ _id });
  }

  async getByOwner(owner: ObjectId) {
    const membership = await this.memberships.readOne({ owner });
    if (!membership) {
      return { owner, tier: Tier.Free, autoRenew: false, renewalDate: new Date(), lastActiveMembership: undefined };
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
    const durationDays = tier === Tier.Trial ? 7 : 30; // Trial is 7 days, Gold is 30 days
    await this.memberships.deleteOne({ owner });
    const now = new Date();
    const renewalDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const _id = await this.memberships.createOne({
      owner,
      tier,
      autoRenew: false,
      renewalDate,
      lastActiveMembership: now,
    });
    return await this.memberships.readOne({ _id });
  }

  async hasTierAccess(owner: ObjectId, requiredTier: Tier) {
    try {
      const membership = await this.getByOwner(owner);
      if (requiredTier === Tier.Free) return true;

      // Check if membership has expired
      if (membership.renewalDate && membership.renewalDate < new Date()) {
        // Membership expired, downgrade to Free
        if (membership.tier !== Tier.Free) {
          await this.memberships.partialUpdateOne({ owner }, { tier: Tier.Free, lastActiveMembership: membership.renewalDate });
        }
        return requiredTier === Tier.Free;
      }

      // For Gold tier access, both Gold and Trial are allowed
      if (requiredTier === Tier.Gold) {
        return membership.tier === Tier.Gold || membership.tier === Tier.Trial;
      }

      return membership.tier === requiredTier;
    } catch {
      return requiredTier === Tier.Free; // If no membership found, only allow Free tier access
    }
  }

  async renewMembership(owner: ObjectId) {
    const membership = await this.getByOwner(owner);
    if (membership.tier === Tier.Free) {
      throw new NotAllowedError("Free users cannot renew membership!");
    }

    const currentTime = Date.now();
    const maxAllowedDate = new Date(currentTime + 75 * 24 * 60 * 60 * 1000);

    // If Trial, upgrade to Gold immediately
    if (membership.tier === Tier.Trial) {
      await this.memberships.partialUpdateOne({ owner }, { tier: Tier.Gold });
    }

    // Calculate new renewal date based on current renewal date
    let baseDate = membership.renewalDate;
    if (baseDate < new Date()) {
      baseDate = new Date();
    }

    const newRenewalDate = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Check if renewal is too far in the future
    if (newRenewalDate > maxAllowedDate) {
      throw new NotAllowedError("Cannot renew membership more than 75 days in advance!");
    }

    await this.memberships.partialUpdateOne({ owner }, { renewalDate: newRenewalDate });
    return await this.getByOwner(owner);
  }

  // This is a placeholder method for the API layer to implement
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getActivePaywallCount(_owner: ObjectId) {
    // This method will be used by the API layer to count active paywalls
    // The actual implementation will be in the API layer since concepts should not reference other concepts
    return 0;
  }
}
