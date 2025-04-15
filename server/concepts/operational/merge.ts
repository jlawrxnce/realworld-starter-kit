type MergeableObject = Record<string, any>;

export class MergeConcept {
  /**
   * Merges multiple objects into a single response object
   * @param key The key under which to nest the merged result
   * @param objects Objects to merge
   * @returns An object with the merged result under the specified key
   */
  createResponse<T extends MergeableObject>(key: string, filter: T, ...objects: Array<MergeableObject>): { [K in typeof key]: T } {
    const merged = Object.assign({}, ...objects);
    const filtered = this.filterToType<T>(merged, filter);
    return { [key]: filtered } as { [K in typeof key]: T };
  }

  /**
   * Filter an object to only include fields that match the target type
   * @param obj Object to filter
   * @returns Filtered object matching target type
   */
  private filterToType<T extends MergeableObject>(obj: MergeableObject, filter: T): T {
    // Initialize result with all properties from the source object
    const result = {} as T;
    const targetKeys = Object.keys(filter);
    // Copy all properties from the source object
    for (const key of targetKeys) {
      result[key as keyof T] = obj[key];
    }

    return result as T;
  }

  /**
   * Merges objects and applies a transform function to the result
   * @param key The key under which to nest the merged result
   * @param transform Function to transform the merged result
   * @param objects Objects to merge
   * @returns An object with the transformed merged result under the specified key
   */
  createTransformedResponse<T extends MergeableObject, R>(key: string, transform: (merged: T) => R, filter: T, ...objects: Array<MergeableObject>): { [K in typeof key]: R } {
    const merged = Object.assign({}, ...objects) as T;
    const filtered = this.filterToType<T>(merged, filter);
    const transformed = transform(filtered);
    return { [key]: transformed } as { [K in typeof key]: R };
  }
}
