import { BaseDoc } from "framework/doc";

export default class MapperConcept {
  mapObjectIds(objects: Array<BaseDoc>) {
    return objects.map((obj) => obj._id);
  }
}
