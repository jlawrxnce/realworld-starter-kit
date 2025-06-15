import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError } from "./errors";

export interface PaywallDoc extends BaseDoc {
  target: ObjectId; // Generic target ID that this paywall applies to
  owner: ObjectId; // User who created the paywall
  enabled: boolean;
}

export default class PaywallConcept {
  public readonly paywalls: DocCollection<PaywallDoc>;

  constructor(name: string) {
    this.paywalls = new DocCollection<PaywallDoc>(name);
  }

  async create(target: ObjectId, owner: ObjectId) {
    const existing = await this.paywalls.readOne({ target });
    if (existing) {
      throw new BadValuesError("Paywall already exists for this target");
    }
    const _id = await this.paywalls.createOne({ target, owner, enabled: false });
    return await this.paywalls.readOne({ _id });
  }

  async toggle(target: ObjectId, owner: ObjectId) {
    let paywall = await this.paywalls.readOne({ target });
    if (!paywall) {
      paywall = await this.create(target, owner);
    }
    if (paywall) {
      await this.paywalls.partialUpdateOne({ target }, { enabled: !paywall.enabled });
    }
    return await this.paywalls.readOne({ target });
  }

  async getActivePaywallCount(owner: ObjectId) {
    return await this.paywalls.count({ owner, enabled: true });
  }

  async isPaywalled(target: ObjectId) {
    const paywall = await this.paywalls.readOne({ target });
    return paywall?.enabled || false;
  }
}
