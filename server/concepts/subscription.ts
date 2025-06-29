import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { BadValuesError, NotAllowedError } from "./errors";

export interface SubscriptionDoc extends BaseDoc {
  user: ObjectId;
  target: ObjectId; // The target of the subscription (e.g., a membership)
  startDate: Date;
  endDate: Date;
}

export default class SubscriptionConcept {
  public readonly subscriptions: DocCollection<SubscriptionDoc>;

  constructor(name: string) {
    this.subscriptions = new DocCollection<SubscriptionDoc>(name);
  }

  async create(user: ObjectId, target: ObjectId, durationDays: number) {
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    const _id = await this.subscriptions.createOne({ user, target, startDate, endDate });
    return await this.subscriptions.readOne({ _id });
  }

  async getActiveSubscription(user: ObjectId, target: ObjectId) {
    const now = new Date();
    return await this.subscriptions.readOne({
      user,
      target,
      endDate: { $gt: now },
    });
  }

  async renew(user: ObjectId, target: ObjectId, durationDays: number) {
    const currentSubscription = await this.getActiveSubscription(user, target);
    if (!currentSubscription) {
      throw new BadValuesError("No active subscription to renew");
    }

    // Calculate new end date based on current end date
    const newEndDate = new Date(currentSubscription.endDate);
    newEndDate.setDate(newEndDate.getDate() + durationDays);

    // Check if renewal is too far in the future (75 days from now)
    const maxAllowedDate = new Date();
    maxAllowedDate.setDate(maxAllowedDate.getDate() + 75);
    if (newEndDate > maxAllowedDate) {
      throw new NotAllowedError("Cannot renew subscription more than 75 days in advance");
    }

    await this.subscriptions.partialUpdateOne({ _id: currentSubscription._id }, { endDate: newEndDate });
    return await this.subscriptions.readOne({ _id: currentSubscription._id });
  }

  async isActive(user: ObjectId, target: ObjectId) {
    const subscription = await this.getActiveSubscription(user, target);
    return subscription !== null;
  }

  async getEndDate(user: ObjectId, target: ObjectId) {
    const subscription = await this.getActiveSubscription(user, target);
    return subscription ? subscription.endDate : null;
  }
}
