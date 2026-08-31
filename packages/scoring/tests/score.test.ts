import assert from "node:assert/strict";
import { test } from "node:test";

import { COMPONENTS, WEIGHTS, candidateLamp, scoreUniverse } from "../src/index.ts";
import { FIXTURE } from "./fixture.ts";
import { rowLookup } from "./rows.ts";

const scored = scoreUniverse(FIXTURE);
const row = rowLookup(scored);

function percentiles(iata: string) {
  const { scoreVector } = row(iata);
  return {
    congestion: scoreVector.congestion.percentile,
    unmetFlightDemand: scoreVector.unmetFlightDemand.percentile,
    delay: scoreVector.delay.percentile,
    growth: scoreVector.growth.percentile,
  };
}

test("the weights are the locked 35/35/20/10 and sum to 100", () => {
  assert.deepEqual(WEIGHTS, {
    congestion: 35,
    unmetFlightDemand: 35,
    delay: 20,
    growth: 10,
  });
  assert.equal(
    COMPONENTS.reduce((total, component) => total + WEIGHTS[component], 0),
    100,
  );
});

// Five large hubs, so a distinct value lands on one of 90/70/50/30/10:
// percentile = 100 * (peers below + half the ties, self included) / peers scored.
test("percentiles are hand-checkable ranks inside the large-hub peer group", () => {
  assert.deepEqual(percentiles("ATL"), {
    congestion: 90, // 10,400,000 pax/runway — highest of five
    unmetFlightDemand: 70, // +2.0 pp — second of five
    delay: 63, // 13.5 min — second of the four large hubs with delay data
    growth: 70, // +3.0% — second of five
  });
  assert.deepEqual(percentiles("ORD"), {
    congestion: 50,
    unmetFlightDemand: 30,
    delay: 88, // 16.5 min — highest of four scored
    growth: 90,
  });
  assert.deepEqual(percentiles("LAX"), {
    congestion: 70,
    unmetFlightDemand: 10,
    delay: 38,
    growth: 10,
  });
  assert.deepEqual(percentiles("BOS"), {
    congestion: 30,
    unmetFlightDemand: 90,
    delay: 13,
    growth: 50,
  });
});

test("composites are the weighted percentiles, rounded, so the vector adds up", () => {
  // ATL: 0.35*90 + 0.35*70 + 0.20*63 + 0.10*70 = 75.6
  assert.equal(row("ATL").composite, 76);
  // ORD: 0.35*50 + 0.35*30 + 0.20*88 + 0.10*90 = 54.6
  assert.equal(row("ORD").composite, 55);
  // LAX: 0.35*70 + 0.35*10 + 0.20*38 + 0.10*10 = 36.6
  assert.equal(row("LAX").composite, 37);
  // BOS: 0.35*30 + 0.35*90 + 0.20*13 + 0.10*50 = 49.6
  assert.equal(row("BOS").composite, 50);
});

test("lamps follow the composite bands once all four inputs are present", () => {
  assert.equal(row("ATL").candidateLamp, "Strong candidate"); // 76
  assert.equal(row("ORD").candidateLamp, "Mixed vector"); // 55
  assert.equal(row("BOS").candidateLamp, "Mixed vector"); // 50
  assert.equal(row("LAX").candidateLamp, "Weak candidate"); // 37
});

test("percentiles are peer-group-relative, so SNA outranks ORD on a smaller raw", () => {
  assert.equal(row("SNA").peerGroup, "medium");
  assert.equal(row("LAX").peerGroup, "large");
  assert.notEqual(row("SNA").peerGroup, row("LAX").peerGroup);

  assert.ok(row("SNA").scoreVector.congestion.raw! < row("ORD").scoreVector.congestion.raw!);
  assert.equal(row("SNA").scoreVector.congestion.percentile, 83); // top of three medium hubs
  assert.equal(row("ORD").scoreVector.congestion.percentile, 50); // middle of five large hubs
});

test("a peer group of one is the median of itself, not the top of the country", () => {
  assert.deepEqual(percentiles("ORH"), {
    congestion: 50,
    unmetFlightDemand: 50,
    delay: 50,
    growth: 50,
  });
  assert.equal(row("ORH").composite, 50);
});

test("a missing component is withheld, never zero-filled or re-weighted", () => {
  const mdw = row("MDW");
  assert.deepEqual(mdw.scoreVector.delay, {
    percentile: null,
    raw: null,
    coverage: "missing",
  });
  assert.equal(mdw.composite, null);
  assert.equal(mdw.candidateLamp, "Partial inputs");
  // The three present components are still real numbers an analyst can read.
  assert.equal(mdw.scoreVector.congestion.percentile, 10);
  assert.equal(mdw.scoreVector.unmetFlightDemand.percentile, 50);
  assert.equal(mdw.scoreVector.growth.percentile, 30);
  // Re-weighting the other three would have produced 0.35*10+0.35*50+0.10*30 -> a number.
  assert.notEqual(mdw.composite, 0);
});

test("an airport with no inputs at all is No data, and its composite is null", () => {
  const hya = row("HYA");
  assert.equal(hya.composite, null);
  assert.equal(hya.candidateLamp, "No data");
  for (const component of COMPONENTS) {
    assert.deepEqual(hya.scoreVector[component], {
      percentile: null,
      raw: null,
      coverage: "missing",
    });
  }
});

test("MDW's blank delay leaves the other large hubs' delay percentiles alone", () => {
  // Four scored values, not five with a zero: the lowest scored delay is 13, not 0.
  const delays = scored
    .filter((candidate) => candidate.peerGroup === "large")
    .map((candidate) => candidate.scoreVector.delay.percentile);
  assert.deepEqual(delays.filter((value) => value !== null).sort((a, b) => a - b), [13, 38, 63, 88]);
});

test("candidateLamp reads a row on its own, at the locked band edges", () => {
  const present = { percentile: 50, raw: 1, coverage: "present" } as const;
  const full = {
    congestion: present,
    unmetFlightDemand: present,
    delay: present,
    growth: present,
  };
  assert.equal(candidateLamp({ composite: 70, scoreVector: full }), "Strong candidate");
  assert.equal(candidateLamp({ composite: 69, scoreVector: full }), "Mixed vector");
  assert.equal(candidateLamp({ composite: 40, scoreVector: full }), "Mixed vector");
  assert.equal(candidateLamp({ composite: 39, scoreVector: full }), "Weak candidate");
  assert.equal(candidateLamp({ composite: null, scoreVector: full }), "No data");

  // Even handed a composite, a 3-of-4 row is Partial inputs: no 3-of-4 number.
  const missing = { percentile: null, raw: null, coverage: "missing" } as const;
  assert.equal(
    candidateLamp({ composite: 88, scoreVector: { ...full, delay: missing } }),
    "Partial inputs",
  );
});

test("rows carry the identity, lookups and caveats the answer objects need", () => {
  const lax = row("LAX");
  assert.equal(lax.name, "Los Angeles International Airport");
  assert.equal(lax.municipality, "Los Angeles");
  assert.equal(lax.state, "CA");
  assert.equal(lax.region, "Pacific");
  assert.equal(lax.slotLimit, "Level 2");
  assert.equal(lax.longHaulShare, 0.2823); // a lookup, never a score-vector slot
  assert.ok(
    lax.assumptions.some((line) => line.includes("congestion 35")),
    "assumptions name the fixed weights",
  );
  assert.ok(
    lax.assumptions.some((line) => line.includes("2023") && line.includes("2024")),
    "assumptions name the comparison window",
  );
  assert.ok(
    lax.assumptions.some((line) => line.includes("peer group")),
    "assumptions name the peer-group percentile rule",
  );
  assert.ok(lax.gaps.includes(FIXTURE.gaps[0]!), "rows carry the snapshot's data gaps");
  assert.equal(row("ORH").longHaulShare, null);
});

test("a partial row says why it has no composite, on that row", () => {
  assert.ok(
    row("MDW").assumptions.some(
      (line) => line.includes("Delay") && line.includes("MDW") && line.includes("missing"),
    ),
    `MDW assumptions name the missing component: ${JSON.stringify(row("MDW").assumptions)}`,
  );
  assert.equal(
    row("ATL").assumptions.some((line) => line.includes("has no composite because")),
    false,
    "a fully scored row does not carry a partial-inputs note",
  );
});

test("a row missing every component names them all in one sentence", () => {
  assert.ok(
    row("HYA").assumptions.some((line) =>
      line.includes("Congestion, Unmet flight demand, Delay and Growth are missing for HYA"),
    ),
    `HYA assumptions name every blank: ${JSON.stringify(row("HYA").assumptions)}`,
  );
});

test("scoring keeps the snapshot's row order and does not mutate it", () => {
  assert.deepEqual(
    scored.map((candidate) => candidate.iata),
    FIXTURE.airports.map((airport) => airport.iata),
  );
  assert.equal(FIXTURE.airports[4]!.inputs.delay.raw, null);
  // `loadSnapshot` memoises one parsed object for the whole process, so a
  // snapshot this function wrote back to — filling a blank, sorting the
  // airports — would follow every later query in that process.
  const untouched = structuredClone(FIXTURE);
  scoreUniverse(FIXTURE);
  assert.deepEqual(FIXTURE, untouched);
});

// PRD "Row payload": #19 asserts an HTTP body equals this object and #26 adds a
// field to it, so the key set is pinned rather than left to drift silently.
test("a row is exactly the locked payload, no more and no less", () => {
  assert.deepEqual(Object.keys(row("LAX")), [
    "iata",
    "name",
    "municipality",
    "state",
    "region",
    "peerGroup",
    "scoreVector",
    "composite",
    "candidateLamp",
    "slotLimit",
    "longHaulShare",
    "assumptions",
    "gaps",
  ]);
  assert.deepEqual(Object.keys(row("LAX").scoreVector), [...COMPONENTS]);
  for (const component of COMPONENTS) {
    assert.deepEqual(Object.keys(row("LAX").scoreVector[component]), [
      "percentile",
      "raw",
      "coverage",
    ]);
  }
});

// A national rank sorts three peer groups' composites into one list, so a small
// hub can outrank a large one. That is the locked design, and the row has to say
// so: the composite is as peer-relative as the percentiles it is built from.
test("the cross-peer-group caveat covers the composite, not just the percentiles", () => {
  const peerRule = row("BOS").assumptions.find((line) => line.includes("peer group"));
  assert.ok(peerRule, "a row names the peer-group rule");
  assert.match(peerRule, /composite/i);

  // ORH is a small hub at 50 and BOS a large hub at 50: the same number, ranked
  // against different fields, which is why the caveat has to be on the row.
  assert.equal(row("ORH").composite, row("BOS").composite);
  assert.notEqual(row("ORH").peerGroup, row("BOS").peerGroup);
});
