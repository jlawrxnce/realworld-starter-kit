// Synchronization syntax parser
import {
  anyOfString,
  between,
  char,
  choice,
  coroutine,
  digit,
  endOfInput,
  everyCharUntil,
  getData,
  letter,
  many,
  optionalWhitespace,
  Parser,
  pipeParsers,
  possibly,
  regex,
  sepBy,
  sequenceOf,
  setData,
  str,
  whitespace,
  withData,
} from "arcsecond";

// Binding types
export type SyncPrimitive = boolean | string | symbol | number | null;
export type SyncLine = [string, SyncPrimitive[], SyncPrimitive[]];
export type SyncBlock = [SyncLine[], SyncLine[]];
export type Syncs = Record<string, SyncBlock[]>;

// Match a sequence of parsers, then join results
const joinedSequence = (parsers: Parser<string, string, unknown>[]) => sequenceOf(parsers).map((s) => s.join(""));
// Match many of parsers, then join results
const joinedMany = (parser: Parser<unknown, string, unknown>) => many(parser).map((s) => s.join(""));
// Between helpers
const betweenWhitespace = between(optionalWhitespace)(optionalWhitespace);
const betweenParens = between(betweenWhitespace(char("(")))(char(")"));
// Comma separated with padding
const sepByComma = sepBy(betweenWhitespace(char(",")));

// Binding logic
const validChars = choice([letter, digit, anyOfString("._-!$*")]);
const binding = joinedSequence([letter, joinedMany(validChars)]);
const bindingSymbol = coroutine((run) => {
  const name = run(binding);
  const bindingMap = run(getData as Parser<unknown, string, unknown>) as Record<string, symbol>;
  if (bindingMap === undefined) {
    return;
  }
  if (name in bindingMap) {
    return bindingMap[name];
  } else {
    const newSymbol = Symbol(name);
    const newEntry = { [name]: newSymbol };
    run(setData({ ...bindingMap, ...newEntry }));
    return newSymbol;
  }
});

// Parse to end of line or end of input
const toEndOfLine = pipeParsers([choice([regex(/^[^\S\r\n]*/), endOfInput])]);
// Parse primitive values according to JSON specification
const parseJsonValue = coroutine((run): unknown => {
  const value = run(everyCharUntil(anyOfString(",)\r\n")));
  return JSON.parse(value);
});
const booleanParser = choice([str("true"), str("false")]).map((b) => b === "true");
const bindingOrValue = choice([booleanParser, bindingSymbol, parseJsonValue]);
// Match return bindings
const returnBinding = pipeParsers([optionalWhitespace, str("->"), optionalWhitespace, sepByComma(bindingOrValue)]);

// A syncline consists of an action, argument bindings, and possible return bindings
const syncLine = sequenceOf([binding, betweenParens(sepByComma(bindingOrValue)), possibly(returnBinding)]);
// Pad each syncline with optional whitespace
const paddedSyncLine = pipeParsers([between(optionalWhitespace)(toEndOfLine)(syncLine)]);
// Each block starts with a when clause
const whenBlock = pipeParsers([optionalWhitespace, str("when"), whitespace, many(paddedSyncLine)]);
// Followed by a mandatory sync clause
const syncBlock = pipeParsers([optionalWhitespace, str("sync"), whitespace, many(paddedSyncLine)]);
// We reinitialize bindings every block
const fullBlock = withData(sequenceOf([whenBlock, syncBlock]))({});
// Index by method name of first line in when block for efficiency
const syncParser = many(fullBlock);
export default (syncs: string) => {
  const parsed = syncParser.run(syncs);
  if (parsed.isError === false) {
    const result = parsed.result as SyncBlock[];
    // Create Syncs by indexing on first action of each SyncBlock
    const syncMap = result.reduce((accum: Syncs, cur: SyncBlock) => {
      const actionLine = cur[0][0];
      if (actionLine === undefined) {
        throw Error("No action found in synchronization");
      }
      const action = actionLine[0];
      if (action in accum) {
        (accum[action] as SyncBlock[]).push(cur);
      } else {
        accum[action] = [cur];
      }
      return accum;
    }, {} as Syncs);
    return syncMap;
  } else {
    throw Error(parsed.error);
  }
};
