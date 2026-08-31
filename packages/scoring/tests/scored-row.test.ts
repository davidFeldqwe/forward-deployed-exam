import assert from "node:assert/strict";
import { test } from "node:test";

import { loadSnapshot } from "@repo/snapshot";

import { isScoredAirport, scoreUniverse, type ScoredAirport } from "../src/index.ts";
import { FIXTURE } from "./fixture.ts";
import { rowLookup } from "./rows.ts";

const scored = scoreUniverse(loadSnapshot());
const row = rowLookup(scored);

/** A row as a store hands it back: JSON that has been outside this process. */
function stored(value: ScoredAirport): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

test("every row this module scores is a scored row after a store's round trip", () => {
  for (const airport of [...scored, ...scoreUniverse(FIXTURE)]) {
    assert.ok(isScoredAirport(stored(airport)), `${airport.iata} did not survive the store`);
  }
});

test("a territory airport has no Census division, and is a scored row anyway", () => {
  // SJU is in the committed universe and the Census Bureau files no territory
  // under a division, so a check that demanded one would refuse a real row.
  const sju = row("SJU");

  assert.equal(sju.region, null);
  assert.ok(isScoredAirport(stored(sju)));
});

test("a coverage state the screen shows is a scored row: Partial inputs withholds its composite", () => {
  // MDW has no delay in the fixture, HYA has no inputs at all.
  const fixtureRow = rowLookup(scoreUniverse(FIXTURE));
  const partial = stored(fixtureRow("MDW"));
  const noData = stored(fixtureRow("HYA"));

  assert.equal(partial.candidateLamp, "Partial inputs");
  assert.equal(partial.composite, null);
  assert.equal(noData.candidateLamp, "No data");
  assert.ok(isScoredAirport(partial));
  assert.ok(isScoredAirport(noData));
});

test("a row missing any value the answer objects draw is not a scored row", () => {
  for (const field of Object.keys(row("BOS"))) {
    const truncated = stored(row("BOS"));
    delete truncated[field];

    assert.equal(isScoredAirport(truncated), false, `a row with no ${field} passed the check`);
  }
});

test("a coordinate is a pair: half of one, or one off the world, is not a scored row", () => {
  const broken = [
    { latitude: 42.3643, longitude: null },
    { latitude: null, longitude: -71.0052 },
    { latitude: 91, longitude: -71.0052 },
    { latitude: 42.3643, longitude: -181 },
    { latitude: "42.3643", longitude: "-71.0052" },
  ];
  for (const pair of broken) {
    assert.equal(
      isScoredAirport({ ...stored(row("BOS")), ...pair }),
      false,
      JSON.stringify(pair),
    );
  }

  // An airport the source does not locate keeps both nulls and stays a row.
  assert.ok(isScoredAirport({ ...stored(row("BOS")), latitude: null, longitude: null }));
});

test("a lamp, coverage state, hub size or slot level off the screen's lists is not a scored row", () => {
  const bos = stored(row("BOS"));
  const off: Record<string, unknown>[] = [
    { candidateLamp: "Great candidate" },
    { peerGroup: "enormous" },
    { slotLimit: "Level 9" },
    { scoreVector: { ...(bos.scoreVector as object), delay: { percentile: null, raw: null, coverage: "unknown" } } },
    { scoreVector: { ...(bos.scoreVector as object), delay: undefined } },
    { assumptions: "one caveat, not a list" },
  ];
  for (const field of off) {
    assert.equal(isScoredAirport({ ...bos, ...field }), false, JSON.stringify(field));
  }

  // No FAA schedule constraint is the common case, and it is not a hole.
  assert.ok(isScoredAirport({ ...bos, slotLimit: null }));
});

test("what is not a row at all is not a scored row", () => {
  for (const value of [null, undefined, "BOS", 79, [], [stored(row("BOS"))]]) {
    assert.equal(isScoredAirport(value), false, JSON.stringify(value ?? null));
  }
});
