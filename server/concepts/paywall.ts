import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
export interface PaywallDoc extends BaseDoc {
  contentId: ObjectId; // ID of the content being restricted (e.g. article ID)
  hasPaywall: boolean;
}

export default class PaywallConcept {
  public readonly paywalls: DocCollection<PaywallDoc>;

  constructor(name: string) {
    this.paywalls = new DocCollection<PaywallDoc>(name);
  }

  async create(contentId: ObjectId) {
    const _id = await this.paywalls.createOne({ contentId, hasPaywall: false });
    return await this.paywalls.readOne({ _id });
  }

  async toggle(contentId: ObjectId) {
    const paywall = (await this.paywalls.readOne({ contentId })) ?? (await this.create(contentId));
    await this.paywalls.partialUpdateOne({ contentId }, { hasPaywall: !paywall.hasPaywall });
    return await this.paywalls.readOne({ contentId });
  }

  async hasPaywall(contentId: ObjectId) {
    const paywall = await this.paywalls.readOne({ contentId });
    return paywall?.hasPaywall ?? false;
  }
}
