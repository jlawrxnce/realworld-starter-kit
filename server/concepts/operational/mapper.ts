import { BaseDoc } from "framework/doc";

export default class MapperConcept {
  mapObjectIds(objects: Array<BaseDoc>) {
    console.log("mapObjectIds", objects);
    return objects.map((obj) => obj._id);
  }
}
