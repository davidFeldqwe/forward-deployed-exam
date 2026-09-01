import assert from "node:assert/strict";
import { test } from "node:test";

import { loadSnapshot } from "@repo/snapshot";

import {
  COMPONENTS,
  DEFAULT_LIMIT,
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
  // #73: the universe is the FAA primary line, so its size moves with the
  // release. What holds is that it is a national screen and not a top-N sample.
  assert.ok(scored.length >= 300, `primary-scale universe, got ${scored.length}`);
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
  assert.deepEqual(peerGroups.toSorted(), ["large", "medium", "nonhub", "small"]);

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

// PRD story 45 / #73: a New England question keeps the `queryAirports` limits.
// Nineteen New England primaries match; ten rows are drawn, which is why
// expanding the universe does not dump hundreds of rows into a thread answer.
test("a New England ranking is the national composite, filtered", () => {
  const newEngland = queryAirports(scored, { region: "New England" });
  assert.equal(newEngland.matched, 19);
  assert.equal(newEngland.rows.length, DEFAULT_LIMIT);
  assert.deepEqual(
    newEngland.rows.map(
      (candidate) => `${candidate.iata} ${candidate.composite} ${candidate.candidateLamp}`,
    ),
    [
      "PVD 89 Strong candidate",
      "BGR 74 Strong candidate",
      "PSM 73 Strong candidate",
      "ACK 66 Mixed vector",
      "ORH 64 Mixed vector",
      "PWM 62 Mixed vector",
      "HYA 61 Mixed vector",
      "BDL 58 Mixed vector",
      "MVY 58 Mixed vector",
      "BOS 50 Mixed vector",
    ],
  );
  for (const candidate of newEngland.rows) {
    assert.equal(candidate, row(candidate.iata), "the row is the national row, not a re-score");
  }
});

test("the national rank is ten rows by default and twenty-five at the cap", () => {
  const top = queryAirports(scored);
  assert.equal(top.matched, scored.length);
  assert.equal(top.rows.length, DEFAULT_LIMIT);
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

// #73: the primary universe reaches airports BTS reporting carriers do not
// serve, so a withheld composite is now committed-file behaviour rather than a
// fixture-only case. This is the ring field `/map` draws.
test("a row the sources do not cover withholds its composite instead of scoring zero", () => {
  const withheld = scored.filter((airport) => airport.composite === null);
  assert.ok(withheld.length > 0, "the committed file reaches airports BTS does not");
  assert.ok(
    withheld.length < scored.length / 2,
    `${withheld.length} of ${scored.length} withheld: most of the universe is still scored`,
  );
  for (const airport of withheld) {
    assert.equal(airport.candidateLamp, "Partial inputs", airport.iata);
    assert.notEqual(airport.candidateLamp, "Weak candidate", airport.iata);
    assert.ok(
      COMPONENTS.some((component) => airport.scoreVector[component].coverage === "missing"),
      `${airport.iata} withholds because an input is missing, not for nothing`,
    );
  }
  // Every one of them is a small or nonhub primary: the large and medium hubs
  // are all BTS reporting-carrier airports, so none of them loses a composite.
  assert.deepEqual(
    [...new Set(withheld.map((airport) => airport.peerGroup))].toSorted(),
    ["nonhub", "small"],
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

test("a compare against an airport outside the primary universe names the code", () => {
  // IAN (Kiana, Alaska) is a real airport with scheduled service that the FAA
  // files as nonprimary commercial service, under the primary line this universe
  // cuts on. A compare must say the code is out of scope rather than answer with
  // one row and let the reader assume both were weighed.
  const compare = queryAirports(scored, { iata: ["LAX", "IAN"] });
  assert.deepEqual(compare.rows.map((candidate) => candidate.iata), ["LAX"]);
  assert.equal(compare.matched, 1);
  assert.deepEqual(compare.unknownIata, ["IAN"]);
  assert.equal(
    scored.some((candidate) => candidate.iata === "IAN"),
    false,
    "IAN really is outside the committed snapshot",
  );
});

// Story 32: an unresolved phrase is refused *with* the accepted ones, so the
// vocabulary has to be the committed universe's own, not a hand-kept list.
test("the accepted place phrases are the committed universe's own", () => {
  const vocabulary = placeVocabulary(scored);
  assert.deepEqual(vocabulary.peerGroup, ["large", "medium", "nonhub", "small"]);
  // Nine Census divisions, minus any the universe does not reach; SJU's blank is
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

// #26: `queryAirports` rows are what the thread would draw a map from, so the
// pair travels on the ranked row rather than being looked up a second time. The
// degrees themselves are pinned where they enter, in the snapshot package.
test("a ranked row carries the coordinates the map is drawn from", () => {
  const byIata = new Map(snapshot.airports.map((airport) => [airport.iata, airport]));
  const newEngland = queryAirports(scored, { region: "New England" });
  // The map gate #24 describes needs two or more located rows, and every New
  // England row drawn carries a pair.
  assert.equal(newEngland.rows.length, DEFAULT_LIMIT);
  for (const candidate of newEngland.rows) {
    const airport = byIata.get(candidate.iata);
    assert.ok(airport);
    assert.equal(candidate.latitude, airport.latitude, `${candidate.iata} latitude`);
    assert.equal(candidate.longitude, airport.longitude, `${candidate.iata} longitude`);
    assert.equal(typeof candidate.latitude, "number", `${candidate.iata} is located`);
  }
});

test("a query result is exactly the locked payload, no more and no less", () => {
  // #19 asserts an HTTP body equals this object, so a rename fails here first.
  assert.deepEqual(Object.keys(queryAirports(scored, { region: "New England" })), [
    "rows",
    "matched",
    "resolvedIata",
    "sortBy",
    "metric",
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
  assert.equal(queryAirports(scored, { state: "CA" }).matched, 24);

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
    // A lookup nulls the sort key and names a metric, so both halves of that
    // pair have to survive the round trip as null and as a string.
    { metric: "longHaulShare" },
  ] as const) {
    const result = queryAirports(scored, args);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result, JSON.stringify(args));
  }
});
