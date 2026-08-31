import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  SORT_KEYS,
  queryAirports,
  scoreUniverse,
  type QueryAirportsArgs,
  type SortBy,
} from "../src/index.ts";
import { FIXTURE } from "./fixture.ts";

const scored = scoreUniverse(FIXTURE);

function codes(args: QueryAirportsArgs = {}): string[] {
  return queryAirports(scored, args).rows.map((row) => row.iata);
}

// Fixture composites: ATL 76, BDL 57, ORD 55, BOS 50, ORH 50, SNA 47, PVD 47,
// LAX 37, and no composite for MDW (partial) or HYA (no data).
test("the default sort is composite, with withheld composites last", () => {
  const result = queryAirports(scored);
  assert.equal(result.sortBy, "composite");
  assert.deepEqual(result.rows.map((row) => row.iata), [
    "ATL",
    "BDL",
    "ORD",
    "BOS",
    "ORH",
    "SNA",
    "PVD",
    "LAX",
    "MDW",
    "HYA",
  ]);
  // Ties (BOS/ORH at 50, SNA/PVD at 47) keep the snapshot's enplanement order.
  assert.deepEqual(result.rows.map((row) => row.composite), [
    76,
    57,
    55,
    50,
    50,
    47,
    47,
    37,
    null,
    null,
  ]);
});

test("a region question filters and sorts, it does not re-percentile", () => {
  const result = queryAirports(scored, { region: "New England" });
  assert.equal(result.matched, 5);
  assert.deepEqual(result.rows.map((row) => row.iata), ["BDL", "BOS", "ORH", "PVD", "HYA"]);

  const national = new Map(scored.map((row) => [row.iata, row]));
  for (const row of result.rows) {
    assert.equal(row, national.get(row.iata), `${row.iata} is the national row, unchanged`);
  }
  // BDL leads New England on a medium-hub composite of 57 while its congestion
  // percentile stays 50 nationally; a local re-percentile would have moved it.
  assert.equal(result.rows[0]?.scoreVector.congestion.percentile, 50);
  assert.equal(result.rows[1]?.scoreVector.congestion.percentile, 30);
});

test("an unresolved place matches nothing rather than guessing", () => {
  const result = queryAirports(scored, { region: "Pacific Northwest" });
  assert.deepEqual(result.rows, []);
  assert.equal(result.matched, 0);
});

test("filters combine, and match on case and padding only", () => {
  assert.deepEqual(codes({ region: "new england", peerGroup: "SMALL" }), ["ORH", "HYA"]);
  assert.deepEqual(codes({ state: " il " }), ["ORD", "MDW"]);
  assert.deepEqual(codes({ peerGroup: "medium" }), ["BDL", "SNA", "PVD"]);
});

test("ORD and MDW stay two rows: the screen never joins on a city market", () => {
  const result = queryAirports(scored, { municipality: "Chicago" });
  assert.equal(result.matched, 2);
  assert.deepEqual(result.rows.map((row) => row.iata), ["ORD", "MDW"]);
  assert.notEqual(result.rows[0]?.name, result.rows[1]?.name);
  assert.equal(result.rows[0]?.composite, 55);
  assert.equal(result.rows[1]?.composite, null);
});

test("a two-code compare returns both rows and ignores the default limit", () => {
  const result = queryAirports(scored, { iata: ["LAX", "sna"] });
  assert.deepEqual(result.rows.map((row) => row.iata), ["SNA", "LAX"]); // 47 then 37
  assert.equal(result.matched, 2);
  assert.notEqual(result.limit, DEFAULT_LIMIT);
  assert.equal(result.limit, MAX_LIMIT);
  // Different peer groups, so the compare is not a like-for-like percentile.
  assert.deepEqual(result.rows.map((row) => row.peerGroup), ["medium", "large"]);
});

test("a single code is a one-row lookup", () => {
  const result = queryAirports(scored, { iata: "ord" });
  assert.deepEqual(result.rows.map((row) => row.iata), ["ORD"]);
  assert.equal(result.matched, 1);
});

test("sortBy ranks on one component's percentile, still peer-group-relative", () => {
  assert.deepEqual(codes({ sortBy: "delay" }), [
    "ORD",
    "BDL",
    "ATL",
    "SNA",
    "ORH",
    "LAX",
    "PVD",
    "BOS",
    "MDW",
    "HYA",
  ]);
  assert.deepEqual(codes({ sortBy: "congestion" }), [
    "ATL",
    "SNA",
    "LAX",
    "ORD",
    "BDL",
    "ORH",
    "BOS",
    "PVD",
    "MDW",
    "HYA",
  ]);
  assert.equal(queryAirports(scored, { sortBy: "growth" }).sortBy, "growth");
});

test("the limit defaults to 10, is honoured when given, and is capped at 25", () => {
  assert.equal(queryAirports(scored).limit, DEFAULT_LIMIT);
  const three = queryAirports(scored, { limit: 3 });
  assert.equal(three.limit, 3);
  assert.deepEqual(three.rows.map((row) => row.iata), ["ATL", "BDL", "ORD"]);
  assert.equal(three.matched, 10, "matched counts the rows before the limit");

  assert.equal(queryAirports(scored, { limit: 100 }).limit, MAX_LIMIT);
  assert.equal(queryAirports(scored, { limit: 0 }).limit, 1);
  assert.equal(queryAirports(scored, { iata: ["ATL", "ORD"], limit: 1 }).rows.length, 1);
});

// `limit` arrives from a query string and from the model, so it can be a number
// the caller never meant. Every one of those lands on a usable row count rather
// than an empty answer the analyst would read as "no airports match".
test("a limit that is not a usable row count is coerced, never left to empty the answer", () => {
  assert.equal(queryAirports(scored, { limit: -3 }).limit, 1);
  assert.equal(queryAirports(scored, { limit: 3.7 }).limit, 3, "a fraction truncates");
  assert.equal(queryAirports(scored, { limit: Number.NaN }).limit, DEFAULT_LIMIT);
  assert.equal(queryAirports(scored, { limit: Number.POSITIVE_INFINITY }).limit, DEFAULT_LIMIT);
  // The fallback is the one the codes lifted, so an unusable limit still returns
  // every row of a compare rather than dropping back to ten.
  assert.equal(
    queryAirports(scored, { iata: ["ATL", "ORD"], limit: Number.NaN }).limit,
    MAX_LIMIT,
  );
});

test("querying leaves the scored universe untouched", () => {
  const before = scored.map((row) => row.iata);
  queryAirports(scored, { sortBy: "delay" });
  assert.deepEqual(scored.map((row) => row.iata), before);
});

// #19's rank HTTP takes sortBy from a query string and #21's tool takes it from
// the model, so the accepted keys are exported rather than re-typed downstream.
test("SORT_KEYS is composite plus the four components, in vector order", () => {
  assert.deepEqual(SORT_KEYS, [
    "composite",
    "congestion",
    "unmetFlightDemand",
    "delay",
    "growth",
  ]);
  for (const sortBy of SORT_KEYS) {
    assert.equal(queryAirports(scored, { sortBy }).sortBy, sortBy);
  }
});

test("an off-list sortBy is refused by name, not a TypeError from the sort", () => {
  assert.throws(
    () => queryAirports(scored, { sortBy: "longHaulShare" as SortBy }),
    (error: unknown) => {
      assert.ok(error instanceof RangeError, `threw ${String(error)}`);
      assert.match(error.message, /longHaulShare/);
      // The message lists what the caller may pass, so a model can correct itself.
      for (const key of SORT_KEYS) assert.match(error.message, new RegExp(key));
      return true;
    },
  );
  // Long-haul share is a lookup on the row, so it is not a sort key at all.
  const lax = queryAirports(scored, { iata: "LAX" }).rows[0];
  assert.equal(lax?.longHaulShare, 0.2823);
});

// A compare is the case where a filter can half-succeed: "LAX vs ITH" returns
// one row, and without this the caller cannot tell that from "both airports came
// back". ITH is a real airport, just not in the top-100 screen, so the honest
// answer names it as outside the universe rather than refusing the whole query.
test("a requested code outside the universe is named, not silently dropped", () => {
  const result = queryAirports(scored, { iata: ["LAX", " ith "] });
  assert.deepEqual(result.rows.map((row) => row.iata), ["LAX"]);
  assert.equal(result.matched, 1);
  assert.deepEqual(result.unknownIata, ["ITH"]);
});

test("unknownIata is empty when nothing was asked for or everything matched", () => {
  assert.deepEqual(queryAirports(scored).unknownIata, []);
  assert.deepEqual(queryAirports(scored, { region: "Pacific Northwest" }).unknownIata, []);
  // Codes are compared after case and padding are normalised, and a code named
  // twice is one request, so neither spelling shows up as unknown.
  const result = queryAirports(scored, { iata: ["lax", " LAX "] });
  assert.equal(result.matched, 1);
  assert.deepEqual(result.unknownIata, []);
});

// Unknown means "not in the screened universe", not "filtered out": LAX is
// scored, it is simply not in New England, so calling it unknown would tell the
// analyst the airport is uncovered when it is one filter away.
test("a code the other filters exclude is still a known airport", () => {
  const result = queryAirports(scored, { iata: "LAX", region: "New England" });
  assert.deepEqual(result.rows, []);
  assert.equal(result.matched, 0);
  assert.deepEqual(result.unknownIata, []);
});

test("an explicitly empty code list asks for no airports, and nothing is unknown", () => {
  const result = queryAirports(scored, { iata: [] });
  assert.deepEqual(result.rows, []);
  assert.equal(result.matched, 0);
  assert.deepEqual(result.unknownIata, []);
});

test("a code filter that matches nothing at all reports every code it was given", () => {
  const result = queryAirports(scored, { iata: ["ITH", "BUR"] });
  assert.equal(result.matched, 0);
  assert.deepEqual(result.unknownIata, ["ITH", "BUR"]);
});

// #19 reads these arguments off a query string, where `searchParams.get` returns
// `null` for a parameter nobody passed, and #21 takes them from a model that
// spells "not asked for" as `null` as often as it leaves the key out. Every null
// filter used to die as `TypeError: Cannot read properties of null (reading
// 'trim')`, and `sortBy: null` was refused as an off-list key.
test("a null argument means the same as omitting it", () => {
  assert.deepEqual(
    queryAirports(scored, {
      iata: null,
      region: null,
      state: null,
      municipality: null,
      peerGroup: null,
      sortBy: null,
      limit: null,
    }),
    queryAirports(scored),
  );
  // A null beside a real filter leaves the real one doing the work, and null
  // codes are no codes at all, so the default limit is not lifted to the cap.
  assert.deepEqual(codes({ region: "New England", state: null }), [
    "BDL",
    "BOS",
    "ORH",
    "PVD",
    "HYA",
  ]);
  assert.equal(queryAirports(scored, { iata: null }).limit, DEFAULT_LIMIT);
  assert.deepEqual(codes({ iata: ["ATL", "ORD"], sortBy: null, limit: null }), ["ATL", "ORD"]);
});

// `null` says nothing was asked for; an empty string is a supplied place phrase
// or sort key that resolves to nothing, which is a different answer. Neither is
// allowed to become a ranking the analyst did not ask for.
test("an empty string is a value the caller supplied, not an omitted one", () => {
  assert.equal(queryAirports(scored, { region: "" }).matched, 0);
  assert.throws(() => queryAirports(scored, { sortBy: "" as SortBy }), RangeError);
});
