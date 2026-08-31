import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreUniverse, type ScoredAirport } from "@repo/scoring";
import { loadSnapshot } from "@repo/snapshot";

import {
  COLUMN_RADIUS,
  MAX_COLUMN_HEIGHT,
  columnHeight,
  groundPoint,
  mapMarks,
} from "./map-view.ts";

const bos: ScoredAirport = {
  iata: "BOS",
  name: "Boston Logan Intl",
  municipality: "Boston",
  state: "MA",
  region: "New England",
  latitude: 42.3643,
  longitude: -71.0052,
  peerGroup: "large",
  scoreVector: {
    congestion: { percentile: 88, raw: 12_400_000, coverage: "present" },
    unmetFlightDemand: { percentile: 81, raw: 6.2, coverage: "present" },
    delay: { percentile: 62, raw: 14.8, coverage: "present" },
    growth: { percentile: 71, raw: 8.4, coverage: "present" },
  },
  composite: 79,
  candidateLamp: "Strong candidate",
  slotLimit: null,
  longHaulShare: 0.241,
  assumptions: [],
  gaps: [],
};

/** A weaker row, west and south of BOS, with every input present. */
const lax: ScoredAirport = {
  ...bos,
  iata: "LAX",
  name: "Los Angeles Intl",
  municipality: "Los Angeles",
  state: "CA",
  region: "Pacific",
  latitude: 33.9425,
  longitude: -118.408,
  composite: 30,
  candidateLamp: "Weak candidate",
};

/** Three of four inputs: the screen withholds a composite rather than zero-fill. */
const hya: ScoredAirport = {
  ...bos,
  iata: "HYA",
  name: "Hyannis / Barnstable Muni",
  peerGroup: "small",
  scoreVector: {
    ...bos.scoreVector,
    delay: { percentile: null, raw: null, coverage: "missing" },
  },
  composite: null,
  candidateLamp: "Partial inputs",
};

/** An airport the coordinate source does not locate: null as a pair. */
const nowhere: ScoredAirport = {
  ...bos,
  iata: "PPG",
  name: "Pago Pago Intl",
  latitude: null,
  longitude: null,
};

function mark(row: ScoredAirport) {
  const found = mapMarks([row]).at(0);
  assert.ok(found, `${row.iata} mark`);
  return found;
}

test("height is linear in the composite score, and a taller composite is a taller column", () => {
  const strong = mark(bos);
  const weak = mark(lax);

  assert.equal(strong.shape, "column");
  assert.ok(strong.height > weak.height);
  // Linear, not ranked and not log: the ratio of two heights is the ratio of
  // the two composites.
  assert.ok(Math.abs(strong.height / weak.height - 79 / 30) < 1e-9);
  assert.equal(columnHeight(100), MAX_COLUMN_HEIGHT);
  assert.equal(columnHeight(50), MAX_COLUMN_HEIGHT / 2);
});

test("radius is one constant, so hub size is not smuggled in as a third encoding", () => {
  assert.ok(COLUMN_RADIUS > 0);
  // No per-mark radius to vary: every column is drawn at the module's one width.
  assert.equal(
    Object.keys(mark(bos)).some((key) => /radius|width|size/i.test(key)),
    false,
  );
});

test("a withheld composite is a ground ring, not a zero-height column, and never red", () => {
  const ring = mark(hya);

  assert.equal(ring.shape, "ring");
  assert.equal(ring.height, 0);
  assert.equal(ring.composite, null);
  assert.equal(ring.lamp, "Partial inputs");
  // The ring's lamp is a coverage state, so it takes no hue at all.
  assert.notEqual(ring.lamp, "Weak candidate");
});

test("an airport with no coordinate pair is off the mesh and still a scored row", () => {
  assert.deepEqual(mapMarks([nowhere]), []);
  // The pair it sits beside is still drawn, so this is omission, not a crash.
  assert.deepEqual(
    mapMarks([bos, nowhere, lax]).map((drawn) => drawn.iata),
    ["BOS", "LAX"],
  );
});

test("the ground frame puts east to the right and north away from the camera", () => {
  const boston = groundPoint(bos);
  const angeles = groundPoint(lax);

  assert.ok(boston.x > angeles.x, "Boston is east of Los Angeles");
  assert.ok(boston.z < angeles.z, "Boston is north of Los Angeles");
});

test("every mark's numbers are the scored row's own, for the committed snapshot", () => {
  const rows = scoreUniverse(loadSnapshot());
  const marks = mapMarks(rows);

  // Nothing in the committed universe is missing a coordinate today, so the
  // skyline is the whole screen.
  assert.equal(marks.length, rows.filter((row) => row.latitude !== null).length);
  assert.ok(marks.length > 0);

  const byIata = new Map(marks.map((drawn) => [drawn.iata, drawn]));
  for (const row of rows) {
    const drawn = byIata.get(row.iata);
    assert.ok(drawn, row.iata);
    assert.equal(drawn.composite, row.composite);
    assert.equal(drawn.lamp, row.candidateLamp);
    assert.equal(drawn.name, row.name);
    assert.equal(drawn.height, row.composite === null ? 0 : columnHeight(row.composite));
  }
});
