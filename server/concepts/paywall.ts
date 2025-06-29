import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

export interface PaywallDoc extends BaseDoc {
  contentId: ObjectId; // ID of the content being restricted (e.g. article ID)
  creator: ObjectId; // User who created the paywall
  hasPaywall: boolean;
}

export default class PaywallConcept {
  public readonly paywalls: DocCollection<PaywallDoc>;

  constructor(name: string) {
    this.paywalls = new DocCollection<PaywallDoc>(name);
  }

  async create(contentId: ObjectId, creator: ObjectId) {
    const _id = await this.paywalls.createOne({ contentId, creator, hasPaywall: false });
    return await this.paywalls.readOne({ _id });
  }

  async toggle(contentId: ObjectId, creator: ObjectId, isTrialUser = false) {
    const paywall = (await this.paywalls.readOne({ contentId })) ?? (await this.create(contentId, creator));
    if (!paywall) throw new NotFoundError("Paywall not found");
    // If turning on paywall and user is on Trial tier, check the limit
    if (!paywall.hasPaywall && isTrialUser) {
      const activePaywallCount = await this.getActivePaywallCount(creator);
      if (activePaywallCount >= 3) {
        throw new NotAllowedError("Trial users cannot have more than 3 active paywalls");
      }
    }
    await this.paywalls.partialUpdateOne({ contentId }, { hasPaywall: !paywall.hasPaywall });

    const updatedPaywall = await this.paywalls.readOne({ contentId });
    if (!updatedPaywall) throw new NotFoundError("Failed to toggle paywall");
    return updatedPaywall;
  }

  async hasPaywall(contentId: ObjectId) {
    const paywall = await this.paywalls.readOne({ contentId });
    return paywall?.hasPaywall ?? false;
  }
  async getActivePaywallCount(creator: ObjectId) {
    return await this.paywalls.count({ creator, hasPaywall: true });
  }
}
