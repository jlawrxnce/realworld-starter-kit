import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError, NotFoundError } from "./errors";

export interface SubscriptionDoc extends BaseDoc {
  subscriber: ObjectId;
  startDate: Date;
  renewalDate: Date;
  autoRenew: boolean;
}

export default class SubscriptionConcept {
  public readonly subscriptions: DocCollection<SubscriptionDoc>;

  constructor(name: string) {
    this.subscriptions = new DocCollection<SubscriptionDoc>(name);
  }

  async create(subscriber: ObjectId, startDate: Date, renewalDate: Date) {
    const existing = await this.subscriptions.readOne({ subscriber });
    if (existing) {
      throw new BadValuesError("Subscription already exists");
    }
    const _id = await this.subscriptions.createOne({ subscriber, startDate, renewalDate, autoRenew: true });
    return await this.subscriptions.readOne({ _id });
  }

  async getSubscription(subscriber: ObjectId) {
    const subscription = await this.subscriptions.readOne({ subscriber });
    if (!subscription) {
      throw new NotFoundError("Subscription not found");
    }
    return subscription;
  }

  async renew(subscriber: ObjectId, currentRenewalDate: Date) {
    const subscription = await this.getSubscription(subscriber);
    const maxRenewalDays = 75;
    const now = new Date();
    const maxRenewalDate = new Date(now);
    maxRenewalDate.setDate(now.getDate() + maxRenewalDays);

    const newRenewalDate = new Date(currentRenewalDate);
    newRenewalDate.setDate(currentRenewalDate.getDate() + 30);

    if (newRenewalDate > maxRenewalDate) {
      throw new BadValuesError("Cannot renew more than 75 days in advance");
    }

    await this.subscriptions.partialUpdateOne({ subscriber }, { renewalDate: newRenewalDate });
    return await this.getSubscription(subscriber);
  }

  async updateAutoRenew(subscriber: ObjectId, autoRenew: boolean) {
    const subscription = await this.getSubscription(subscriber);
    await this.subscriptions.partialUpdateOne({ subscriber }, { autoRenew });
    return await this.getSubscription(subscriber);
  }
}
