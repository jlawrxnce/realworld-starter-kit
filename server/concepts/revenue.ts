import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { Tier } from "./membership";

export interface RevenueDoc extends BaseDoc {
  contentId: ObjectId;
  earnerId: ObjectId;
  amount: number;
  timestamp: Date;
}

export default class RevenueConcept {
  public readonly revenues: DocCollection<RevenueDoc>;

  constructor(collectionName: string) {
    this.revenues = new DocCollection<RevenueDoc>(collectionName);
  }

  async create(contentId: ObjectId, earnerId: ObjectId, tier: Tier) {
    const amount = tier !== Tier.Free ? 0.25 : 0;
    const _id = await this.revenues.createOne({ contentId, earnerId, amount, timestamp: new Date() });
    return await this.revenues.readOne({ _id });
  }

  async getTotalRevenue(earnerId: ObjectId) {
    const revenues = await this.revenues.readMany({ earnerId });
    return revenues.reduce((total, rev) => total + rev.amount, 0.0);
  }
}
