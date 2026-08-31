import assert from "node:assert/strict";
import { test } from "node:test";

import { loadSnapshot } from "@repo/snapshot";

import {
  COMPONENTS,
  MAX_LIMIT,
  PLACE_FIELDS,
  WEIGHTS,
  placeVocabulary,
  queryAirports,
  scoreUniverse,
} from "../src/index.ts";
import { rowLookup } from "./rows.ts";

// The committed snapshot, scored: the numbers a reviewer curls and an analyst
// reads. A fresh clone runs this with no aviation HTTP.
const snapshot = loadSnapshot();
const scored = scoreUniverse(snapshot);
const row = rowLookup(scored);

test("every airport in the committed snapshot is scored", () => {
  assert.equal(scored.length, snapshot.airports.length);
  assert.equal(scored.length, 100);
  for (const airport of scored) {
    for (const component of COMPONENTS) {
      const { percentile, coverage } = airport.scoreVector[component];
      assert.equal(percentile === null, coverage === "missing", `${airport.iata} ${component}`);
      if (percentile !== null) {
        assert.ok(
          Number.isInteger(percentile) && percentile >= 0 && percentile <= 100,
          `${airport.iata} ${component} percentile is a whole 0-100 rank, got ${percentile}`,
        );
      }
    }
  }
});

test("each composite is the weighted score vector on that row", () => {
  for (const airport of scored) {
    if (airport.composite === null) continue;
    const weighted = COMPONENTS.reduce(
      (total, component) =>
        total + WEIGHTS[component] * airport.scoreVector[component].percentile!,
      0,
    );
    assert.equal(airport.composite, Math.round(weighted / 100), `${airport.iata} composite`);
  }
  // Spot check by hand: LAX is 0.35*89 + 0.35*2 + 0.20*27 + 0.10*2 = 37.45.
  const lax = row("LAX");
  assert.equal(lax.composite, 37);
  assert.equal(lax.candidateLamp, "Weak candidate");
  assert.equal(lax.longHaulShare, 0.2823);
  assert.equal(lax.slotLimit, "Level 2");
});

test("percentiles are monotone in the raw value inside a peer group", () => {
  const peerGroups = [...new Set(scored.map((airport) => airport.peerGroup))];
  assert.deepEqual(peerGroups.toSorted(), ["large", "medium", "small"]);

  for (const component of COMPONENTS) {
    for (const peerGroup of peerGroups) {
      const peers = scored
        .filter((airport) => airport.peerGroup === peerGroup)
        .map((airport) => airport.scoreVector[component])
        .filter((slot) => slot.raw !== null);
      assert.ok(peers.length > 1, `${peerGroup} has a ${component} distribution`);
      for (const left of peers) {
        for (const right of peers) {
          if (left.raw! > right.raw!) {
            assert.ok(
              left.percentile! >= right.percentile!,
              `${component}: a larger raw never ranks below a smaller one`,
            );
          }
        }
      }
    }
  }
});

test("SNA and LAX are ranked in different peer groups", () => {
  const sna = row("SNA");
  const lax = row("LAX");
  assert.equal(sna.peerGroup, "medium");
  assert.equal(lax.peerGroup, "large");
  // SNA's congestion percentile is a medium-hub rank, so it is not comparable
  // to LAX's even though LAX carries three and a half times the raw load.
  assert.ok(sna.scoreVector.congestion.raw! < lax.scoreVector.congestion.raw!);
  assert.equal(sna.scoreVector.congestion.percentile, 77);
  assert.equal(lax.scoreVector.congestion.percentile, 89);
});

test("ORD and MDW are two Chicago rows, never one city market", () => {
  const chicago = queryAirports(scored, { municipality: "Chicago" });
  assert.deepEqual(chicago.rows.map((candidate) => candidate.iata), ["ORD", "MDW"]);
  assert.equal(chicago.rows[0]?.composite, 45);
  assert.equal(chicago.rows[1]?.composite, 29);
});

test("a New England ranking is the national composite, filtered", () => {
  const newEngland = queryAirports(scored, { region: "New England" });
  assert.equal(newEngland.matched, 4);
  assert.deepEqual(
    newEngland.rows.map(
      (candidate) => `${candidate.iata} ${candidate.composite} ${candidate.candidateLamp}`,
    ),
    [
      "PVD 87 Strong candidate",
      "BDL 58 Mixed vector",
      "PWM 51 Mixed vector",
      "BOS 50 Mixed vector",
    ],
  );
  for (const candidate of newEngland.rows) {
    assert.equal(candidate, row(candidate.iata), "the row is the national row, not a re-score");
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
  assert.deepEqual(compare.rows.map((candidate) => candidate.iata), ["LAX", "SNA"]);
  assert.equal(compare.limit, MAX_LIMIT);
  assert.deepEqual(compare.rows.map((candidate) => candidate.composite), [37, 32]);
});

test("a territory has no division, so a region ranking never returns it", () => {
  const sju = row("SJU");
  assert.equal(sju.region, null);
  assert.ok(sju.gaps.some((gap) => gap.includes("SJU") && gap.includes("PR")));
  for (const division of ["South Atlantic", "Pacific", "New England"]) {
    const rows = queryAirports(scored, { region: division }).rows;
    assert.equal(rows.some((candidate) => candidate.iata === "SJU"), false);
  }
});

test("the committed snapshot is fully covered, so partial rows need a fixture", () => {
  const withheld = scored.filter((airport) => airport.composite === null);
  assert.deepEqual(
    withheld.map((airport) => airport.iata),
    [],
    "no airport in the committed file is missing an input today",
  );
});

test("the national rank mixes peer groups, and every row says so", () => {
  const top = queryAirports(scored, { limit: MAX_LIMIT }).rows;
  const groups = new Set(top.map((candidate) => candidate.peerGroup));
  assert.ok(groups.size > 1, `the top ${MAX_LIMIT} spans peer groups, not just one: ${[...groups]}`);
  // PVD is a small hub ranked above BOS, a large hub, on the same list. Neither
  // number is a like-for-like reading of the other, so the caveat is on the row.
  const pvd = row("PVD");
  const bos = row("BOS");
  assert.equal(pvd.peerGroup, "small");
  assert.equal(bos.peerGroup, "large");
  assert.ok(pvd.composite! > bos.composite!);
  for (const candidate of [pvd, bos]) {
    assert.ok(
      candidate.assumptions.some(
        (line) => line.includes("peer group") && line.includes("composite"),
      ),
      `${candidate.iata} carries the cross-peer-group caveat`,
    );
  }
});

test("a compare against an airport outside the top 100 names the code", () => {
  // ITH (Ithaca) is a real airport that the FAA top-100 universe does not reach,
  // so a compare must say the code is out of scope rather than answer with one
  // row and let the reader assume both were weighed.
  const compare = queryAirports(scored, { iata: ["LAX", "ITH"] });
  assert.deepEqual(compare.rows.map((candidate) => candidate.iata), ["LAX"]);
  assert.equal(compare.matched, 1);
  assert.deepEqual(compare.unknownIata, ["ITH"]);
  assert.equal(
    scored.some((candidate) => candidate.iata === "ITH"),
    false,
    "ITH really is outside the committed snapshot",
  );
});

// Story 32: an unresolved phrase is refused *with* the accepted ones, so the
// vocabulary has to be the committed universe's own, not a hand-kept list.
test("the accepted place phrases are the committed universe's own", () => {
  const vocabulary = placeVocabulary(scored);
  assert.deepEqual(vocabulary.peerGroup, ["large", "medium", "small"]);
  // Nine Census divisions, minus any the top 100 does not reach; SJU's blank is
  // not offered as a phrase, because a region ranking never returns it.
  assert.ok(vocabulary.region.length <= 9, `${vocabulary.region.length} divisions`);
  assert.ok(vocabulary.region.includes("New England"));
  assert.equal(vocabulary.region.includes(""), false);
  assert.equal(vocabulary.state.length, new Set(vocabulary.state).size);
  for (const state of vocabulary.state) assert.match(state, /^[A-Z]{2}$/);
  assert.ok(vocabulary.municipality.includes("Chicago"));
  // The vocabulary and the filter agree on every value the universe carries.
  for (const field of PLACE_FIELDS) {
    for (const value of vocabulary[field]) {
      assert.ok(queryAirports(scored, { [field]: value }).matched > 0, `${field} ${value}`);
    }
  }
});

test("a query result is exactly the locked payload, no more and no less", () => {
  // #19 asserts an HTTP body equals this object, so a rename fails here first.
  assert.deepEqual(Object.keys(queryAirports(scored, { region: "New England" })), [
    "rows",
    "matched",
    "resolvedIata",
    "sortBy",
    "limit",
    "unknownIata",
    "unknownPlace",
  ]);
});

// The committed file is the one where getting this wrong is expensive: twelve
// airports really are in California, so answering `state: "California"` with an
// empty ranking and no other signal is a wrong answer about a covered place.
test("an unresolved place phrase is named against the committed universe", () => {
  const spelled = queryAirports(scored, { state: "California" });
  assert.equal(spelled.matched, 0);
  assert.deepEqual(spelled.unknownPlace, [{ field: "state", value: "California" }]);
  assert.equal(queryAirports(scored, { state: "CA" }).matched, 12);

  // Both values are real; only the combination is empty, so nothing is unknown.
  const combined = queryAirports(scored, { region: "New England", state: "CA" });
  assert.equal(combined.matched, 0);
  assert.deepEqual(combined.unknownPlace, []);
});

test("a query result survives JSON unchanged, so an HTTP body can equal it", () => {
  // #19 curls a ranking and asserts the body equals this object. That only holds
  // if nothing in the payload changes shape on the way through JSON: an
  // `undefined` would be dropped, a non-finite number would become null, and a
  // Map or Set would come back as `{}`. A withheld composite has to stay null.
  for (const args of [
    {},
    { region: "New England" },
    { iata: ["LAX", "ITH"] },
    { sortBy: "delay", limit: MAX_LIMIT },
  ] as const) {
    const result = queryAirports(scored, args);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result, JSON.stringify(args));
  }
});
