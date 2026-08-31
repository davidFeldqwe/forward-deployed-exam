import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { CandidateLamp, ScoredAirport } from "@repo/scoring";

import { MAP_HEIGHT, MAP_PADDING, MAP_WIDTH, resolvedMap } from "./resolved-map.ts";
import type { JsonObject, ToolCall } from "./thread-messages.ts";

const base: ScoredAirport = {
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

/** One row of the payload the table draws: a code, a point, and a lamp. */
function airport(
  iata: string,
  latitude: number | null,
  longitude: number | null,
  candidateLamp: CandidateLamp = "Strong candidate",
): ScoredAirport {
  return { ...base, iata, name: `${iata} airport`, latitude, longitude, candidateLamp };
}

const BOS = airport("BOS", 42.3643, -71.0052);
const PVD = airport("PVD", 41.7267, -71.4327, "Weak candidate");
const HYA = airport("HYA", 41.6693, -70.2804, "Partial inputs");

function call(args: JsonObject, rows: readonly ScoredAirport[]): ToolCall {
  return {
    tool: "queryAirports",
    args,
    result: {
      rows: rows as unknown as JsonObject[],
      matched: rows.length,
      resolvedIata: rows.map((row) => row.iata),
      sortBy: "composite",
      // As `queryAirports` echoes it: a lookup names the one number it read.
      metric: args.metric ?? null,
      limit: 10,
      unknownIata: [],
      unknownPlace: [],
    },
    durationMs: 12,
  };
}

const NEW_ENGLAND = "Which airports in New England are most capacity-constrained?";

test("a region question, a region filter and two located rows draw the resolved set", () => {
  const map = resolvedMap(NEW_ENGLAND, call({ region: "New England" }, [BOS, PVD]));

  assert.equal(map?.place, "New England");
  assert.deepEqual(
    map?.markers.map((marker) => [marker.iata, marker.lamp]),
    [
      ["BOS", "Strong candidate"],
      ["PVD", "Weak candidate"],
    ],
  );
});

test("a state named in the message is a place phrase too", () => {
  const map = resolvedMap("Massachusetts airports by delay", call({ state: "MA" }, [BOS, HYA]));

  assert.equal(map?.place, "Massachusetts");
  assert.equal(map?.markers.length, 2);
});

test("a follow-up naming no state or region draws no map, whatever it filtered on", () => {
  const question = "How does the second one compare?";

  // Even against the same rows, and even when the model re-filtered by region:
  // carried context is not a place phrase in *this* message.
  assert.equal(resolvedMap(question, call({ region: "New England" }, [BOS, PVD])), null);
  assert.equal(resolvedMap(question, call({ iata: ["BOS", "PVD"] }, [BOS, PVD])), null);
});

test("an IATA compare is two codes, not a place", () => {
  const map = resolvedMap(
    "Compare congestion at LAX and SNA",
    call({ iata: ["LAX", "SNA"] }, [airport("LAX", 33.9425, -118.408), airport("SNA", 33.6757, -117.868)]),
  );

  assert.equal(map, null);
});

test("a place phrase with no state or region filter behind it draws no map", () => {
  // "Boston airports" resolves to a municipality; the gate is the tool arguments
  // as well as the message, so a municipality or a peer group is not a set to place.
  assert.equal(resolvedMap("Boston airports", call({ municipality: "Boston" }, [BOS, PVD])), null);
  assert.equal(
    resolvedMap("New England large hubs", call({ peerGroup: "large" }, [BOS, PVD])),
    null,
  );
});

test("one pin is not a set, and an unlocated row is not a pin", () => {
  assert.equal(resolvedMap(NEW_ENGLAND, call({ region: "New England" }, [BOS])), null);
  assert.equal(
    resolvedMap(NEW_ENGLAND, call({ region: "New England" }, [BOS, airport("PWM", null, null)])),
    null,
  );
});

test("a single-metric lookup gets no map: it withheld the lamp the markers light", () => {
  const lookup = call({ region: "New England", metric: "delay" }, [BOS, PVD]);

  assert.equal(resolvedMap("Delay minutes for New England airports", lookup), null);
});

test("an answer that is not a ranking has nothing to place", () => {
  assert.equal(resolvedMap(NEW_ENGLAND, undefined), null);
  assert.equal(
    resolvedMap(NEW_ENGLAND, { ...call({ region: "New England" }, [BOS, PVD]), tool: "describeMethodology" }),
    null,
  );
  assert.equal(resolvedMap(null, call({ region: "New England" }, [BOS, PVD])), null);
});

const NEW_ENGLAND_SET = [
  BOS,
  PVD,
  airport("BDL", 41.9389, -72.6832),
  airport("BTV", 44.472, -73.1533),
];

function newEnglandMap() {
  const map = resolvedMap(NEW_ENGLAND, call({ region: "New England" }, NEW_ENGLAND_SET));
  assert.ok(map);
  return map;
}

test("the crop is the set's own bounding box: it fills the drawing on the longer axis", () => {
  const map = newEnglandMap();
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

  const across = spread(map.markers.map((marker) => marker.x)) / (MAP_WIDTH - 2 * MAP_PADDING);
  const down = spread(map.markers.map((marker) => marker.y)) / (MAP_HEIGHT - 2 * MAP_PADDING);

  // One axis fills the padded box — a set drawn on a map of the whole country
  // would fill neither — and neither axis overflows it.
  assert.ok(Math.max(across, down) > 0.99, `filled ${Math.max(across, down)}`);
  assert.ok(across <= 1.001 && down <= 1.001, `overflowed ${across} / ${down}`);
});

test("every marker sits inside the padding, so no airport is drawn on the edge", () => {
  for (const marker of newEnglandMap().markers) {
    assert.ok(marker.x >= MAP_PADDING - 0.1 && marker.x <= MAP_WIDTH - MAP_PADDING + 0.1);
    assert.ok(marker.y >= MAP_PADDING - 0.1 && marker.y <= MAP_HEIGHT - MAP_PADDING + 0.1);
  }
});

test("north is up and east is right", () => {
  const markers = new Map(newEnglandMap().markers.map((marker) => [marker.iata, marker]));
  const bos = markers.get("BOS")!;
  const pvd = markers.get("PVD")!;
  const btv = markers.get("BTV")!;

  // BOS is north-east of PVD; BTV is the northern-most of the four.
  assert.ok(bos.y < pvd.y, `${bos.y} < ${pvd.y}`);
  assert.ok(bos.x > pvd.x, `${bos.x} > ${pvd.x}`);
  assert.equal(Math.min(...newEnglandMap().markers.map((marker) => marker.y)), btv.y);
});

test("a ranked row the snapshot cannot locate is named, not silently dropped", () => {
  const map = resolvedMap(
    NEW_ENGLAND,
    call({ region: "New England" }, [BOS, PVD, airport("PWM", null, null)]),
  );

  assert.deepEqual(map?.markers.map((marker) => marker.iata), ["BOS", "PVD"]);
  assert.deepEqual(map?.unplaced, ["PWM"]);
  assert.match(map?.caption ?? "", /PWM carries no coordinate in the snapshot and is not drawn/);
  // The table stays the source of truth, and the caption says so.
  assert.match(map?.caption ?? "", /ranking table/i);
});

test("two airports a few miles apart are not zoomed into opposite corners", () => {
  const map = resolvedMap(
    "Which New York airports are constrained?",
    call({ state: "NY" }, [airport("LGA", 40.7772, -73.8726), airport("JFK", 40.6398, -73.7789)]),
  );
  const [lga, jfk] = map?.markers ?? [];

  // The crop stops zooming below a degree of arc: a nine-mile hop drawn across
  // the whole card would read as a region. It is a floor, not a fixed frame —
  // and it is what keeps two airports on one meridian from scaling by infinity.
  assert.ok(Math.abs((lga?.x ?? 0) - (jfk?.x ?? 0)) < 20);
  assert.ok(Math.abs((lga?.y ?? 0) - (jfk?.y ?? 0)) < 30);
});

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

test("the map is inline SVG: no tiles, no network, no WebGL, no map library", () => {
  const map = source("components/answers/ResolvedMap.tsx");

  for (const forbidden of [/https?:\/\//, /mapbox/i, /leaflet/i, /webgl/i, /<img/i, /fetch\(/]) {
    assert.doesNotMatch(map, forbidden);
  }
  assert.match(map, /<svg/);

  // Nothing was added to the bundle to draw it, either.
  const manifest = JSON.parse(source("package.json")) as { dependencies: Record<string, string> };
  for (const dependency of Object.keys(manifest.dependencies)) {
    assert.doesNotMatch(dependency, /mapbox|leaflet|maplibre|topojson|d3-geo|deck\.gl/);
  }
});

test("markers take the table's lamp hues, and the map carries the same legend", () => {
  const map = source("components/answers/ResolvedMap.tsx");

  assert.match(map, /lampMarker\(marker\.lamp\)/);
  assert.match(map, /<LampLegend/);
  // The words are on the map as well as in the legend: a dot is not a label.
  assert.match(map, /\{marker\.iata\}/);
});

test("the map is drawn after the ranking table it belongs to", () => {
  const transcript = source("components/Transcript.tsx");
  const at = (tag: string) => {
    const index = transcript.indexOf(tag);
    assert.notEqual(index, -1, `missing ${tag}`);
    return index;
  };

  // The order the answer objects lock: table, then the picture of the same
  // rows, then this answer's caveats. Each row's score vector expands inside
  // the table above, so the map never comes between a row and its numbers.
  assert.ok(at("<Ranking") < at("<ResolvedMap"));
  assert.ok(at("<ResolvedMap") < at("<Caveats"));
});

const prd = readFileSync(new URL("../../PRD.md", web), "utf8");

test("the PRD states the map gate the build enforces, and the slot it draws in", () => {
  const start = prd.indexOf("In-thread map");
  assert.notEqual(start, -1, "PRD does not name the in-thread map");
  const map = prd.slice(start, start + 900);

  // The three halves of the gate, in the doc a reviewer reads before the code.
  for (const clause of [/state/i, /region/i, /two or more/i, /coordinates/i]) {
    assert.match(map, clause);
  }
  assert.match(map, /after the ranking table/i);
  // No tiles is a claim about the shipped bundle, so the doc makes it too.
  assert.match(map, /no tiles?\b|no map library/i);
});
