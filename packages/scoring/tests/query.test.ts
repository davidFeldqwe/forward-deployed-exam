import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  queryAirports,
  scoreUniverse,
  type QueryAirportsArgs,
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

test("querying leaves the scored universe untouched", () => {
  const before = scored.map((row) => row.iata);
  queryAirports(scored, { sortBy: "delay" });
  assert.deepEqual(scored.map((row) => row.iata), before);
});
