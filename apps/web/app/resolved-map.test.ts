import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { ScoredAirport } from "@repo/scoring";

import { rankingView } from "./ranking-view.ts";
import {
  MAP_HEIGHT,
  MAP_LABEL_WIDTH,
  MAP_PADDING,
  MAP_WIDTH,
  resolvedMap,
} from "./resolved-map.ts";
import type { JsonObject, ToolCall } from "./thread-messages.ts";
import { US_STATES } from "./us-outlines.ts";

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

/**
 * One row of the payload the table draws: a code, a point, and whatever else
 * this case turns on — the lamp a marker lights, or the state and division the
 * map reads to know which place its rows are actually in.
 */
function airport(
  iata: string,
  latitude: number | null,
  longitude: number | null,
  extra: Partial<ScoredAirport> = {},
): ScoredAirport {
  return { ...base, iata, name: `${iata} airport`, latitude, longitude, ...extra };
}

const BOS = airport("BOS", 42.3643, -71.0052);
const PVD = airport("PVD", 41.7267, -71.4327, { candidateLamp: "Weak candidate", state: "RI" });
const HYA = airport("HYA", 41.6693, -70.2804, { candidateLamp: "Partial inputs" });

/** Rows the snapshot files outside New England, for the cases about the label. */
const CALIFORNIA = { state: "CA", region: "Pacific" } as const;
const NEW_YORK = { state: "NY", region: "Middle Atlantic" } as const;

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
    call({ iata: ["LAX", "SNA"] }, [
      airport("LAX", 33.9425, -118.408, CALIFORNIA),
      airport("SNA", 33.6757, -117.868, CALIFORNIA),
    ]),
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

test("a place the snapshot cannot resolve has nothing to draw", () => {
  // Wyoming is on the closed list and the model filtered by it, but the
  // hundred-airport universe holds none. An empty resolved set is not a
  // picture: the unresolvable-place refusal is the whole of that answer.
  const empty = call({ state: "WY" }, []);

  assert.equal(resolvedMap("Which Wyoming airports are constrained?", empty), null);
});

test("a single-metric lookup gets no map: it withheld the lamp the markers light", () => {
  const lookup = call({ region: "New England", metric: "delay" }, [BOS, PVD]);

  assert.equal(resolvedMap("Delay minutes for New England airports", lookup), null);
});

test("an answer that is not a ranking has nothing to place", () => {
  const methodology = {
    ...call({ region: "New England" }, [BOS, PVD]),
    tool: "describeMethodology" as const,
  };

  assert.equal(resolvedMap(NEW_ENGLAND, undefined), null);
  assert.equal(resolvedMap(NEW_ENGLAND, methodology), null);
  assert.equal(resolvedMap(null, call({ region: "New England" }, [BOS, PVD])), null);
});

const NEW_ENGLAND_SET = [
  BOS,
  PVD,
  airport("BDL", 41.9389, -72.6832, { state: "CT" }),
  airport("BTV", 44.472, -73.1533, { state: "VT" }),
];

function newEnglandMap() {
  const map = resolvedMap(NEW_ENGLAND, call({ region: "New England" }, NEW_ENGLAND_SET));
  assert.ok(map);
  return map;
}

test("a New England ranking shows geography under the markers, not a blank card", () => {
  const map = newEnglandMap();
  const bos = map.markers.find((marker) => marker.iata === "BOS");
  const massachusetts = map.ground.find((outline) => outline.state === "MA");

  // The drawing is a map of the place: land is present, and BOS sits on
  // Massachusetts in the same projection the dots use — not a rectangle of
  // lamps with nothing under them.
  assert.ok((map.ground.length ?? 0) > 0, "no geography under the markers");
  assert.ok(bos && massachusetts, "BOS or Massachusetts missing from the drawing");
  assert.ok(
    massachusetts.rings.some((ring) => pointInRing(bos.x, bos.y, ring)),
    `BOS at ${bos.x},${bos.y} is not on the Massachusetts outline`,
  );
});

/** Whether a projected airport sits inside a projected ring: land, not a guess. */
function pointInRing(
  x: number,
  y: number,
  ring: readonly { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const crosses = a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

test("the land is the committed Census outline, in the dots' own crop", () => {
  const map = newEnglandMap();
  const massachusetts = US_STATES.find((outline) => outline.state === "MA");
  const drawn = map.ground.find((outline) => outline.state === "MA");
  const vertex = massachusetts?.rings[0]?.[0];
  const bos = map.markers.find((marker) => marker.iata === "BOS");
  const btv = map.markers.find((marker) => marker.iata === "BTV");
  assert.ok(massachusetts && drawn && vertex && bos && btv);

  const [longitude, latitude] = vertex;
  const projected = drawn.rings[0][0];
  const btvRow = NEW_ENGLAND_SET.find((row) => row.iata === "BTV")!;
  const scaleNorth = (bos.y - btv.y) / ((btvRow.latitude as number) - (BOS.latitude as number));
  const expectedY = bos.y - (latitude - (BOS.latitude as number)) * scaleNorth;

  // The first Massachusetts vertex is the committed degree-pair, placed with
  // the same north-up scale as BOS→BTV — not a second coastline.
  assert.ok(Math.abs(projected.y - expectedY) < 1, `${projected.y} vs ${expectedY}`);
  assert.ok(projected.x > bos.x === longitude > (BOS.longitude as number));
  assert.equal(drawn.rings[0].length, massachusetts.rings[0].length);
});

test("a California ranking's crop does not carry Alaska along", () => {
  const map = resolvedMap(
    "Which California airports are constrained?",
    call({ state: "CA" }, [
      airport("LAX", 33.9425, -118.408, CALIFORNIA),
      airport("SFO", 37.6188, -122.375, CALIFORNIA),
    ]),
  );

  assert.ok(map?.ground.some((outline) => outline.state === "CA"));
  assert.equal(
    map?.ground.some((outline) => outline.state === "AK"),
    false,
    "Alaska met a California bounding box",
  );
});

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

test("an edge airport keeps its code inside the drawing, on whichever side fits", () => {
  // A set wide enough to fill the box across: the eastern-most marker sits on
  // the padding, so its code has to flip to the left of the dot or be clipped
  // by the crop — an airport drawn with half a code is worse than no code.
  const map = resolvedMap(
    "Which New York airports are constrained?",
    call({ state: "NY" }, [
      airport("BUF", 42.9405, -78.7322, NEW_YORK),
      airport("ROC", 43.1189, -77.6724, NEW_YORK),
      airport("ALB", 42.7483, -73.8017, NEW_YORK),
    ]),
  );
  assert.ok(map);

  for (const { iata, x, label } of map.markers) {
    const [left, right] =
      label.anchor === "start"
        ? [label.x, label.x + MAP_LABEL_WIDTH]
        : [label.x - MAP_LABEL_WIDTH, label.x];
    assert.ok(left >= 0 && right <= MAP_WIDTH, `${iata} label ${left}..${right}`);
    // And it is beside its own dot, not floating off on its own.
    assert.ok(Math.abs(label.x - x) <= MAP_LABEL_WIDTH, `${iata} label at ${label.x}, dot at ${x}`);
  }
  // Only the eastern-most had to flip: a code reads to the right of its dot
  // wherever there is room for it.
  const anchors = new Map(map.markers.map((marker) => [marker.iata, marker.label.anchor]));
  assert.deepEqual([...anchors], [["BUF", "start"], ["ROC", "start"], ["ALB", "end"]]);
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

test("the map names the place its rows are in, not another the message mentions", () => {
  // Two places in one sentence, and the turn answered the second: a heading
  // reading "New England" over Californian dots is a picture claiming a
  // geography the answer does not have.
  const map = resolvedMap(
    "How do New England airports compare with California?",
    call({ state: "CA" }, [
      airport("LAX", 33.9425, -118.408, CALIFORNIA),
      airport("SFO", 37.6188, -122.375, CALIFORNIA),
    ]),
  );

  assert.equal(map?.place, "California");
  assert.match(map?.caption ?? "", /coordinates for California/);
});

test("a state question answered with the whole division is labelled by the rows", () => {
  // Story 19 lets the two halves of the gate disagree about which row they
  // name — the message says Massachusetts, the model filtered the division —
  // so the label follows the rows: six states of dots are not Massachusetts.
  const map = resolvedMap(
    "Massachusetts airports by delay",
    call({ region: "New England" }, [BOS, PVD]),
  );

  assert.equal(map?.place, "New England");
});

test("rows that share no place leave the map claiming none", () => {
  const map = resolvedMap(
    NEW_ENGLAND,
    call({ region: "New England" }, [BOS, airport("LAX", 33.9425, -118.408, CALIFORNIA)]),
  );

  // Still a map of the rows the table drew, but with no place in the caption:
  // there is no true one-word answer to what these two are a set of.
  assert.equal(map?.markers.length, 2);
  assert.equal(map?.place, null);
  assert.match(map?.caption ?? "", /coordinates\./);
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

test("every marker's lamp is the one the table drew for that row, off one payload", () => {
  // The acceptance criterion, read end to end rather than by grepping the
  // component: one stored call, the table's rows and the map's markers, and no
  // row that means one thing in the table and another under the dots.
  const payload = call({ region: "New England" }, [
    BOS,
    PVD,
    HYA,
    airport("PWM", null, null, { candidateLamp: "No data" }),
  ]);
  const view = rankingView(payload);
  const map = resolvedMap(NEW_ENGLAND, payload);
  assert.ok(view && map);

  const tableLamps = new Map(view.rows.map((row) => [row.iata, row.lamp]));
  for (const marker of map.markers) {
    assert.equal(marker.lamp, tableLamps.get(marker.iata), marker.iata);
  }
  // Including the coverage states, which are a lamp and not an absent one.
  assert.deepEqual(
    map.markers.map((marker) => marker.lamp),
    ["Strong candidate", "Weak candidate", "Partial inputs"],
  );
  // The row the table drew and the map could not place is named, not relabelled.
  assert.deepEqual(map.unplaced, ["PWM"]);
});

test("two airports a few miles apart are not zoomed into opposite corners", () => {
  const map = resolvedMap(
    "Which New York airports are constrained?",
    call({ state: "NY" }, [
      airport("LGA", 40.7772, -73.8726, NEW_YORK),
      airport("JFK", 40.6398, -73.7789, NEW_YORK),
    ]),
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
  // Land is drawn first, as paths, so geography sits under the lamps.
  assert.ok(map.indexOf("<path") < map.indexOf("<circle"), "markers painted under the land");

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
  const order = source("app/thread-answer.ts");
  const at = (tag: string) => {
    const index = order.indexOf(`"${tag}"`);
    assert.notEqual(index, -1, `missing ${tag} in THREAD_ANSWER_TAGS`);
    return index;
  };

  // The locked tag order: table, then the picture of the same rows, then this
  // answer's caveats. Each row's score vector expands inside the table above,
  // so the map never comes between a row and its numbers.
  assert.ok(at("ranking") < at("map"));
  assert.ok(at("map") < at("caveats"));
});

const prd = readFileSync(new URL("../../PRD.md", web), "utf8");

test("the PRD states the map gate the build enforces, and the slot it draws in", () => {
  const start = prd.indexOf("In-thread map");
  assert.notEqual(start, -1, "PRD does not name the in-thread map");
  // The whole paragraph, so a sentence added to the end of it is still pinned.
  const map = prd.slice(start, prd.indexOf("\n\n", start));

  // The three halves of the gate, in the doc a reviewer reads before the code.
  for (const clause of [/state/i, /region/i, /two or more/i, /coordinates/i]) {
    assert.match(map, clause);
  }
  assert.match(map, /after the ranking table/i);
  // And what the heading over the dots is allowed to claim.
  assert.match(map, /rows are (all )?in/i);
  // No tiles is a claim about the shipped bundle, so the doc makes it too.
  assert.match(map, /no tiles?\b|no map library/i);
  assert.match(map, /outline/i);
});
