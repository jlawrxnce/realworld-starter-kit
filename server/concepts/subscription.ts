import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError } from "./errors";

export interface SubscriptionDoc extends BaseDoc {
  subscriber: ObjectId;
  target: ObjectId;
  startDate: Date;
  endDate: Date;
  totalViews: number;
}

export default class SubscriptionConcept {
  public readonly subscriptions: DocCollection<SubscriptionDoc>;

  constructor(collectionName: string) {
    this.subscriptions = new DocCollection<SubscriptionDoc>(collectionName);
  }

  async create(subscriber: ObjectId, target: ObjectId, durationDays: number) {
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const _id = await this.subscriptions.createOne({ subscriber, target, startDate, endDate, totalViews: 0 });
    return await this.subscriptions.readOne({ _id });
  }

  async getBySubscriberAndTarget(subscriber: ObjectId, target: ObjectId) {
    return await this.subscriptions.readOne({ subscriber, target });
  }

  async isActive(subscriber: ObjectId, target: ObjectId) {
    const subscription = await this.getBySubscriberAndTarget(subscriber, target);
    if (!subscription) {
      return false;
    }
    return subscription.endDate.getTime() > Date.now();
  }

  async renew(subscriber: ObjectId, target: ObjectId, durationDays: number) {
    const subscription = await this.getBySubscriberAndTarget(subscriber, target);
    if (!subscription) {
      throw new NotAllowedError("Subscription not found!");
    }
    const currentTime = Date.now();
    const baseDate = subscription.endDate.getTime() > currentTime ? subscription.endDate : new Date();
    const newEndDate = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    // Check if renewal is too far in the future (75 days)
    const maxAllowedDate = new Date(currentTime + 75 * 24 * 60 * 60 * 1000);
    if (newEndDate.getTime() > maxAllowedDate.getTime()) {
      throw new NotAllowedError("Cannot renew subscription more than 75 days in advance!");
    }
    await this.subscriptions.partialUpdateOne({ _id: subscription._id }, { endDate: newEndDate });
    return await this.subscriptions.readOne({ _id: subscription._id });
  }

  async incrementViews(subscriber: ObjectId, target: ObjectId) {
    const subscription = await this.getBySubscriberAndTarget(subscriber, target);
    if (!subscription) {
      return;
    }
    await this.subscriptions.partialUpdateOne({ _id: subscription._id }, { totalViews: subscription.totalViews + 1 });
  }

  async getTotalViews(subscriber: ObjectId, target: ObjectId) {
    const subscription = await this.getBySubscriberAndTarget(subscriber, target);
    return subscription ? subscription.totalViews : 0;
  }
}
