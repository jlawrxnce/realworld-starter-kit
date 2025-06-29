import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotFoundError } from "./errors";
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
    if (!paywall) throw new NotFoundError("Paywall not found");
    await this.paywalls.partialUpdateOne({ contentId }, { hasPaywall: !paywall.hasPaywall });

    const updatedPaywall = await this.paywalls.readOne({ contentId });
    if (!updatedPaywall) throw new NotFoundError("Failed to toggle paywall");
    return updatedPaywall;
  }

  async hasPaywall(contentId: ObjectId) {
    const paywall = await this.paywalls.readOne({ contentId });
    return paywall?.hasPaywall ?? false;
  }
}
