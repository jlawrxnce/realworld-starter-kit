import { ObjectId } from "mongodb";
import parse, { SyncLine, SyncPrimitive, Syncs } from "./parser";

type ActionMap = Record<string, Function>;
// Trace of action that has been executed and contains return value
type ExecutedActionTrace = [string, unknown[], unknown];
type Bindings = Record<symbol, unknown>;

export default class Synchronizer {
  public readonly actionMap: ActionMap;
  public readonly syncs: Syncs;
  constructor(
    public readonly concepts: Array<unknown>,
    syncInput: string,
  ) {
    this.actionMap = this.mapActions(concepts);
    this.syncs = parse(syncInput);
  }
  // Map actions from concept names to the actual methods
  // TODO: hide private methods, or find a way to properly scan only for concept actions
  private mapActions(concepts: Array<unknown>) {
    return Object.fromEntries(
      concepts.flatMap((concept) => {
        const fullConceptName = Object.getPrototypeOf(concept).constructor.name;
        // Assuming a naming pattern of "Concept" at the end, should probably revisit this convention
        const conceptName = fullConceptName.slice(0, -"Concept".length);
        const propertyNames = Object.getOwnPropertyNames(Object.getPrototypeOf(concept));
        return propertyNames
          .filter((propertyName) => propertyName != "constructor")
          .map((propertyName) => {
            // Typescript having trouble with dynamic property name lookup on unknown concepts
            // eslint-disable-next-line
            return [conceptName + "." + propertyName, (concept as any)[propertyName].bind(concept)];
          });
      }),
    );
  }
  // Match action arguments to bindings, create new if binding is free
  private matchTerms(actionArg: unknown, syncArg: SyncPrimitive, bindings: Bindings) {
    if (typeof syncArg === "symbol") {
      if (syncArg in bindings) {
        // TODO: Remove hack for MongoDB ObjectID comparisons
        const boundSyncArg = bindings[syncArg];
        if (actionArg instanceof ObjectId && boundSyncArg instanceof ObjectId) {
          return actionArg.equals(boundSyncArg);
        }
        return actionArg === bindings[syncArg];
      }
      // Unbound symbol, so we bind
      bindings[syncArg] = actionArg;
      return true;
    }
    return actionArg === syncArg;
  }
  // Match an action trace to a SyncLine, including multiple return bindings
  private matchTrace([action, actionArgs, result]: ExecutedActionTrace, [syncAction, syncArgs, syncResult]: SyncLine, bindings: Bindings) {
    // console.dir(["action: ", [action, actionArgs, result]], { depth: null });
    // console.dir(["sync: ", [syncAction, syncArgs, syncResult]], { depth: null });
    // console.dir(["bindings: ", bindings], { depth: null });
    if (action !== syncAction) {
      throw Error("Actions do not match");
    }
    actionArgs.forEach((arg, i) => {
      if (!this.matchTerms(arg, syncArgs[i], bindings)) {
        throw Error("Argument does not match");
      }
    });
    // Match if return bindings exist
    if (syncResult !== null) {
      // Check and match for single return binding
      if (syncResult.length === 1) {
        console.log("matching single return: ");
        if (!this.matchTerms(result, syncResult[0], bindings)) {
          throw Error("Return binding does not match function return");
        }
      }
      // Check for multiple returns
      else if (syncResult.length > 1) {
        if (!Array.isArray(result)) {
          throw Error("Multiple bindings found for singular return");
        }
        if (result.length !== syncResult.length) {
          throw Error("Function returns differing number of values from specified return bindings");
        }
        syncResult.forEach((ret, i) => {
          if (!this.matchTerms(result[i], ret, bindings)) {
            throw Error("Return value does not match");
          }
        });
      }
    }
  }
  // Given that an action has already run with a trace, find and execute the next set
  private async syncTrace(trace: ExecutedActionTrace): Promise<ExecutedActionTrace[]> {
    const action = trace[0];
    console.log("Syncing single trace: ", trace);
    if (!(action in this.syncs)) {
      return [];
    }
    const blocksToCheck = this.syncs[action];
    let executedTraces: ExecutedActionTrace[] = [];
    // Check each full synchronization block
    for (const block of blocksToCheck) {
      const [whenBlock, syncBlock] = block;
      // Prepare a fresh set of speculative traces and bindings
      const localTraces: ExecutedActionTrace[] = [];
      const bindings: Bindings = {};
      // Helper to lookup bound arguments in subsequent traces
      const lookupArguments = (arg: unknown) => {
        if (typeof arg == "symbol") {
          if (arg in bindings) {
            return bindings[arg];
          } else {
            throw Error("Unbound argument");
          }
        }
        return arg;
      };
      // Helper to execute a SyncLine and match
      const runAndMatchLine = async (line: SyncLine) => {
        const [nextAction, nextArgs] = line;
        const boundArgs = nextArgs.map(lookupArguments);
        // Run next action
        const result = await this.actionMap[nextAction](...boundArgs);
        const newTrace: ExecutedActionTrace = [nextAction, boundArgs, result];
        this.matchTrace(newTrace, line, bindings);
        localTraces.push(newTrace);
      };
      // Match on when block
      try {
        const firstWhen = whenBlock[0];
        const restWhen = whenBlock.slice(1);
        this.matchTrace(trace, firstWhen, bindings);
        for (const line of restWhen) {
          await runAndMatchLine(line);
        }
      } catch (error) {
        // During when block no need to throw error
        console.log("When clause failed to match due to: ", error);
        continue;
      }
      // Match on sync block if we haven't exited yet
      for (const line of syncBlock) {
        await runAndMatchLine(line);
      }
      // A full successful match means we append the history
      executedTraces = executedTraces.concat(localTraces);
    }

    return executedTraces;
  }
  public async run(action: string, actionArgs: unknown[]) {
    // Run once and return the result of the first action
    const result = await this.actionMap[action](...actionArgs);
    const trace: ExecutedActionTrace = [action, actionArgs, result];
    let traces = [trace];
    traces = traces.concat(await this.syncTrace(trace));
    let i = 1;
    while (traces.length > i) {
      const nextTraces = await this.syncTrace(traces[i]);
      if (nextTraces.length > 0) {
        traces = traces.concat(nextTraces);
      }
      i++;
    }
    console.log("Execution history:", traces);
    return result;
  }
}
