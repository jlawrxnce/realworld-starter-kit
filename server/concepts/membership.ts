import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError, NotAllowedError } from "./errors";

export enum Tier {
  Free = "Free",
  Trial = "Trial",
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
    // Trial membership lasts for 1 week, Gold for 30 days
    if (tier === Tier.Trial) {
      renewalDate.setDate(renewalDate.getDate() + 7); // Set renewal date to 1 week from now
    } else {
      renewalDate.setDate(renewalDate.getDate() + 30); // Set renewal date to 30 days from now
    }

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

    // Gold users cannot downgrade to Trial
    if (membership.tier === Tier.Gold && update.tier === Tier.Trial) {
      throw new BadValuesError("Gold members cannot downgrade to Trial tier");
    }

    // If Gold user updates to Free, just turn off auto-renewal without changing tier
    if (membership.tier === Tier.Gold && update.tier === Tier.Free) {
      await this.memberships.partialUpdateOne({ user }, { autoRenew: false });
      return await this.memberships.readOne({ user });
    }

    await this.memberships.partialUpdateOne({ user }, update);
    return await this.memberships.readOne({ user });
  }

  async renew(user: ObjectId) {
    const membership = await this.memberships.readOne({ user });
    if (!membership) {
      throw new NotAllowedError("User does not have an active membership to renew");
    }

    if (membership.tier === Tier.Free) {
      throw new NotAllowedError("Free users cannot renew membership");
    }

    // Calculate new renewal date based on current renewal date
    const newRenewalDate = new Date(membership.renewalDate);
    newRenewalDate.setDate(newRenewalDate.getDate() + 30); // Add 30 days

    // Check if renewal is too far in the future (75 days from now)
    const maxAllowedDate = new Date();
    maxAllowedDate.setDate(maxAllowedDate.getDate() + 75);
    if (newRenewalDate > maxAllowedDate) {
      throw new NotAllowedError("Cannot renew membership more than 75 days in advance");
    }

    // If user is on Trial, upgrade to Gold immediately
    if (membership.tier === Tier.Trial) {
      await this.memberships.partialUpdateOne({ user }, { tier: Tier.Gold, renewalDate: newRenewalDate });
    } else {
      await this.memberships.partialUpdateOne({ user }, { renewalDate: newRenewalDate });
    }
    return await this.memberships.readOne({ user });
  }

  async isGoldOrTrialMember(user: ObjectId) {
    const membership = await this.getMembership(user);
    return membership.tier === Tier.Gold || membership.tier === Tier.Trial;
  }

  async isGoldMember(user: ObjectId) {
    const membership = await this.getMembership(user);
    return membership.tier === Tier.Gold;
  }

  async isTrialMember(user: ObjectId) {
    const membership = await this.getMembership(user);
    return membership.tier === Tier.Trial;
  }
}
