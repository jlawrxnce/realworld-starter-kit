import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError } from "./errors";
import { Tier } from "./membership";

export interface PaywallDoc extends BaseDoc {
  contentId: ObjectId;
  enabled: boolean;
  requiredTier: Tier;
}

export default class PaywallConcept {
  public readonly paywalls: DocCollection<PaywallDoc>;

  constructor(collectionName: string) {
    this.paywalls = new DocCollection<PaywallDoc>(collectionName);
  }

  async create(contentId: ObjectId) {
    const _id = await this.paywalls.createOne({ contentId, enabled: false, requiredTier: Tier.Gold });
    return await this.paywalls.readOne({ _id });
  }

  async getByContent(contentId: ObjectId) {
    const paywall = await this.paywalls.readOne({ contentId });
    if (!paywall) {
      const _id = await this.paywalls.createOne({ contentId, enabled: false, requiredTier: Tier.Gold });
      return await this.paywalls.readOne({ _id });
    }
    return paywall;
  }

  async toggle(contentId: ObjectId) {
    const paywall = await this.getByContent(contentId);
    if (!paywall) {
      throw new BadValuesError("Paywall not found");
    }
    await this.paywalls.deleteOne({ contentId });
    const _id = await this.paywalls.createOne({ contentId, enabled: !paywall.enabled, requiredTier: Tier.Gold });
    return await this.paywalls.readOne({ _id });
  }

  async isAccessible(contentId: ObjectId, userTier: Tier) {
    const paywall = await this.getByContent(contentId);
    if (!paywall || !paywall.enabled) return true;
    return userTier === paywall.requiredTier;
  }
}
