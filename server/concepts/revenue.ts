import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { Tier } from "./membership";

export interface RevenueDoc extends BaseDoc {
  creator: ObjectId; // Content creator
  amount: number; // Amount earned from the view
  source: ObjectId; // Content that generated revenue
  timestamp: Date;
}

export default class RevenueConcept {
  public readonly revenues: DocCollection<RevenueDoc>;

  constructor(name: string) {
    this.revenues = new DocCollection<RevenueDoc>(name);
  }

  async create(creator: ObjectId, source: ObjectId, tier: Tier) {
    const amount = tier === Tier.Gold ? 0.25 : tier === Tier.Silver ? 0.1 : 0.0;
    const _id = await this.revenues.createOne({ creator, source, amount, timestamp: new Date() });
    return await this.revenues.readOne({ _id });
  }

  async getTotalRevenue(creator: ObjectId) {
    const revenues = await this.revenues.readMany({ creator });
    return revenues.reduce((total, rev) => total + rev.amount, 0);
  }

  async getRevenueBySource(source: ObjectId) {
    return await this.revenues.readMany({ source });
  }
}
