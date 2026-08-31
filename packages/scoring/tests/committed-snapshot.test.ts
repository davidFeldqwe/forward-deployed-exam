import assert from "node:assert/strict";
import { test } from "node:test";

import { loadSnapshot } from "@repo/snapshot";

import {
  COMPONENTS,
  MAX_LIMIT,
  WEIGHTS,
  queryAirports,
  scoreUniverse,
} from "../src/index.ts";

// The committed snapshot, scored: the numbers a reviewer curls and an analyst
// reads. A fresh clone runs this with no aviation HTTP.
const snapshot = loadSnapshot();
const scored = scoreUniverse(snapshot);
const byIata = new Map(scored.map((row) => [row.iata, row]));

test("every airport in the committed snapshot is scored", () => {
  assert.equal(scored.length, snapshot.airports.length);
  assert.equal(scored.length, 100);
  for (const row of scored) {
    for (const component of COMPONENTS) {
      const { percentile, coverage } = row.scoreVector[component];
      assert.equal(percentile === null, coverage === "missing", `${row.iata} ${component}`);
      if (percentile !== null) {
        assert.ok(Number.isInteger(percentile) && percentile >= 0 && percentile <= 100);
      }
    }
  }
});

test("each composite is the weighted score vector on that row", () => {
  for (const row of scored) {
    if (row.composite === null) continue;
    const weighted = COMPONENTS.reduce(
      (total, component) => total + WEIGHTS[component] * row.scoreVector[component].percentile!,
      0,
    );
    assert.equal(row.composite, Math.round(weighted / 100), `${row.iata} composite`);
  }
  // Spot check by hand: LAX is 0.35*89 + 0.35*2 + 0.20*27 + 0.10*2 = 37.45.
  const lax = byIata.get("LAX");
  assert.equal(lax?.composite, 37);
  assert.equal(lax?.candidateLamp, "Weak candidate");
  assert.equal(lax?.longHaulShare, 0.2823);
  assert.equal(lax?.slotLimit, "Level 2");
});

test("percentiles are monotone in the raw value inside a peer group", () => {
  for (const component of COMPONENTS) {
    for (const peerGroup of ["large", "medium", "small"]) {
      const peers = scored
        .filter((row) => row.peerGroup === peerGroup)
        .map((row) => row.scoreVector[component])
        .filter((slot) => slot.raw !== null);
      assert.ok(peers.length > 1, `${peerGroup} has a ${component} distribution`);
      for (const left of peers) {
        for (const right of peers) {
          if (left.raw! > right.raw!) {
            assert.ok(
              left.percentile! > right.percentile! ||
                left.percentile === right.percentile,
              `${component}: a larger raw never ranks below a smaller one`,
            );
          }
        }
      }
    }
  }
});

test("SNA and LAX are ranked in different peer groups", () => {
  const sna = byIata.get("SNA");
  const lax = byIata.get("LAX");
  assert.equal(sna?.peerGroup, "medium");
  assert.equal(lax?.peerGroup, "large");
  // SNA's congestion percentile is a medium-hub rank, so it is not comparable
  // to LAX's even though LAX carries three and a half times the raw load.
  assert.ok(sna!.scoreVector.congestion.raw! < lax!.scoreVector.congestion.raw!);
  assert.equal(sna?.scoreVector.congestion.percentile, 77);
  assert.equal(lax?.scoreVector.congestion.percentile, 89);
});

test("ORD and MDW are two Chicago rows, never one city market", () => {
  const chicago = queryAirports(scored, { municipality: "Chicago" });
  assert.deepEqual(chicago.rows.map((row) => row.iata), ["ORD", "MDW"]);
  assert.equal(chicago.rows[0]?.composite, 45);
  assert.equal(chicago.rows[1]?.composite, 29);
});

test("a New England ranking is the national composite, filtered", () => {
  const newEngland = queryAirports(scored, { region: "New England" });
  assert.equal(newEngland.matched, 4);
  assert.deepEqual(
    newEngland.rows.map((row) => `${row.iata} ${row.composite} ${row.candidateLamp}`),
    [
      "PVD 87 Strong candidate",
      "BDL 58 Mixed vector",
      "PWM 51 Mixed vector",
      "BOS 50 Mixed vector",
    ],
  );
  for (const row of newEngland.rows) {
    assert.equal(row, byIata.get(row.iata), "the row is the national row, not a re-score");
  }
});

test("the national rank is ten rows by default and twenty-five at the cap", () => {
  const top = queryAirports(scored);
  assert.equal(top.matched, 100);
  assert.equal(top.rows.length, 10);
  assert.equal(top.rows[0]?.iata, "RSW");
  assert.equal(top.rows[0]?.composite, 94);
  assert.equal(queryAirports(scored, { limit: 100 }).rows.length, MAX_LIMIT);
});

test("a Los Angeles versus Santa Ana compare returns both rows", () => {
  const compare = queryAirports(scored, { iata: ["LAX", "SNA"] });
  assert.deepEqual(compare.rows.map((row) => row.iata), ["LAX", "SNA"]);
  assert.equal(compare.limit, MAX_LIMIT);
  assert.deepEqual(compare.rows.map((row) => row.composite), [37, 32]);
});

test("a territory has no division, so a region ranking never returns it", () => {
  const sju = byIata.get("SJU");
  assert.equal(sju?.region, null);
  assert.ok(sju?.gaps.some((gap) => gap.includes("SJU") && gap.includes("PR")));
  for (const division of ["South Atlantic", "Pacific", "New England"]) {
    const rows = queryAirports(scored, { region: division }).rows;
    assert.equal(rows.some((row) => row.iata === "SJU"), false);
  }
});

test("the committed snapshot is fully covered, so partial rows need a fixture", () => {
  const withheld = scored.filter((row) => row.composite === null);
  assert.deepEqual(withheld, [], "no airport in the committed file is missing an input today");
});
