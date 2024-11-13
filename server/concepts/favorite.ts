import { Filter, ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";

export interface FavoriteDoc extends BaseDoc {
  userId: ObjectId;
  target: ObjectId;
}

export default class FavoriteConcept {
  public readonly favorites: DocCollection<FavoriteDoc>;
  // TODO: generate inverse
  private readonly follows: Map<ObjectId, Array<ObjectId>>;

  constructor(name: string) {
    // initialize statee
    this.favorites = new DocCollection<FavoriteDoc>(name);
    this.follows = new Map<ObjectId, Array<ObjectId>>();
  }

  async create(userId: ObjectId, target: ObjectId) {
    const _id = await this.favorites.createOne({ userId, target });
    return { msg: "Favorite successfully created!", favorite: await this.favorites.readOne({ _id }) };
  }

  async delete(userId: ObjectId, target: ObjectId) {
    await this.favorites.deleteOne({ userId, target });
    return { msg: "Favorite deleted successfully!" };
  }

  async deleteByTarget(target: ObjectId) {
    await this.favorites.deleteMany({ target });
    return { msg: "Favorites deleted successfully!" };
  }

  async getFavorites(query: Filter<FavoriteDoc>) {
    const favorites = await this.favorites.readMany(query, {
      sort: { dateUpdated: -1 },
    });
    return favorites;
  }

  async countTargetFavorites(target: ObjectId) {
    const favorites = await this.getFavorites({ target });
    return favorites.length;
  }

  async isFavoritedByUser(userId: ObjectId, target: ObjectId) {
    const favorite = await this.getFavorites({ userId, target });
    return favorite.length != 0;
  }
}
