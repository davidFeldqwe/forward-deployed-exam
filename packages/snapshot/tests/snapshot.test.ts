import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CENSUS_DIVISIONS,
  SLOT_LIMITS,
  airportSnapshotSchema,
  loadSnapshot,
} from "../src/index.ts";

const snapshot = loadSnapshot();
const byIata = new Map(snapshot.airports.map((airport) => [airport.iata, airport]));

test("the committed snapshot validates and covers roughly the top 100 US airports", () => {
  assert.ok(snapshot.airports.length >= 95, "at least 95 airports");
  assert.ok(snapshot.airports.length <= 105, "at most 105 airports");
  assert.equal(snapshot.joinKey, "iata");
  for (const airport of snapshot.airports) {
    assert.match(airport.iata, /^[A-Z]{3}$/);
    assert.ok(airport.name.length > 0, `${airport.iata} has a name`);
    assert.ok(airport.municipality.length > 0, `${airport.iata} has a municipality`);
  }
});

test("airports are ordered by enplanements in the second window year", () => {
  const enplanements = snapshot.airports.map(
    (airport) => airport.enplanements.secondYear ?? 0,
  );
  const sorted = [...enplanements].sort((left, right) => right - left);
  assert.deepEqual(enplanements, sorted);
});

test("the comparison window is two full calendar years, written into the snapshot", () => {
  const { firstYear, secondYear } = snapshot.comparisonWindow;
  assert.equal(secondYear, firstYear + 1);
  assert.ok(secondYear < new Date(snapshot.asOf).getUTCFullYear(), "window is in the past");
});

test("slot limits are the FAA Level 2 and Level 3 lists and nothing else", () => {
  const labelled = Object.fromEntries(
    snapshot.airports
      .filter((airport) => airport.slotLimit !== null)
      .map((airport) => [airport.iata, airport.slotLimit]),
  );
  assert.deepEqual(labelled, {
    ORD: "Level 2",
    LAX: "Level 2",
    EWR: "Level 2",
    SFO: "Level 2",
    JFK: "Level 3",
    LGA: "Level 3",
    DCA: "Level 3",
  });
  assert.deepEqual(labelled, SLOT_LIMITS);
});

test("IATA identity keeps city-market neighbours apart", () => {
  const chicago = ["ORD", "MDW"].map((iata) => byIata.get(iata));
  assert.deepEqual(
    chicago.map((airport) => airport?.municipality),
    ["Chicago", "Chicago"],
  );
  assert.notEqual(chicago[0]?.name, chicago[1]?.name);

  const capital = ["DCA", "IAD", "BWI"].map((iata) => byIata.get(iata));
  assert.equal(capital.filter((airport) => airport !== undefined).length, 3);
  assert.equal(new Set(capital.map((airport) => airport?.name)).size, 3);
});

test("LAX and SNA are separate rows in different FAA hub peer groups", () => {
  assert.equal(byIata.get("LAX")?.peerGroup, "large");
  assert.equal(byIata.get("SNA")?.peerGroup, "medium");
});

test("region is one of the nine Census divisions, and null only outside the states", () => {
  for (const airport of snapshot.airports) {
    if (airport.region === null) {
      assert.ok(
        ["PR", "VI", "GU", "AS", "MP"].includes(airport.state),
        `${airport.iata} has no region only because ${airport.state} is a territory`,
      );
      continue;
    }
    assert.ok(
      CENSUS_DIVISIONS.includes(airport.region),
      `${airport.iata} region ${airport.region} is a Census division`,
    );
  }
  assert.equal(byIata.get("BOS")?.region, "New England");
});

test("missing inputs are explicit, never zero-filled", () => {
  for (const airport of snapshot.airports) {
    for (const [component, input] of Object.entries(airport.inputs)) {
      assert.equal(
        input.coverage === "missing",
        input.raw === null,
        `${airport.iata} ${component} coverage matches its input`,
      );
    }
  }
  const covered = snapshot.airports.filter((airport) =>
    Object.values(airport.inputs).every((input) => input.coverage === "present"),
  );
  assert.ok(
    covered.length >= snapshot.airports.length * 0.8,
    "most airports have all four score-vector inputs",
  );
});

test("long-haul share and runway count are lookups carried alongside the vector", () => {
  const lax = byIata.get("LAX");
  assert.ok(lax);
  assert.equal(lax.longHaulShare.coverage, "present");
  assert.ok((lax.longHaulShare.share ?? 0) > 0);
  assert.ok((lax.runwayCount ?? 0) >= 4);
  assert.equal(snapshot.methodology.longHaulShare.thresholdMiles, 2000);
});

test("every airport carries the OurAirports coordinate pair the map is drawn from", () => {
  for (const { iata, latitude, longitude } of snapshot.airports) {
    assert.ok(
      typeof latitude === "number" && Math.abs(latitude) <= 90,
      `${iata} latitude ${latitude} is degrees, so the resolved set can be placed`,
    );
    assert.ok(
      typeof longitude === "number" && Math.abs(longitude) <= 180,
      `${iata} longitude ${longitude} is degrees`,
    );
    // Every airport in today's universe is west of Greenwich, San Juan included.
    // A Pacific territory entering the top 100 would fail this line, which is the
    // point: someone then checks the sign rather than shipping a mirrored map.
    assert.ok(longitude < 0, `${iata} is in the western hemisphere`);
  }

  // Pinned against OurAirports: Logan is on Boston harbour, and the sign is the
  // one thing a coordinate can lose silently — a positive longitude would put
  // New England in Kazakhstan.
  const bos = byIata.get("BOS");
  assert.ok(
    typeof bos?.latitude === "number" && typeof bos.longitude === "number",
    "BOS is a located row",
  );
  assert.ok(Math.abs(bos.latitude - 42.3643) < 0.01, `BOS latitude ${bos.latitude}`);
  assert.ok(Math.abs(bos.longitude - -71.0052) < 0.01, `BOS longitude ${bos.longitude}`);
});

test("half a coordinate is refused, so a marker is never drawn on one axis", () => {
  const halved = structuredClone(snapshot) as { airports: { longitude: number | null }[] };
  halved.airports[0]!.longitude = null;
  assert.throws(() => airportSnapshotSchema.parse(halved), /pair/);
});

test("the snapshot names its sources and gaps", () => {
  const ids = snapshot.sources.map((source) => source.id);
  for (const id of ["faa-acais", "bts-on-time-performance", "ourairports", "faa-slot-administration"]) {
    assert.ok(ids.includes(id), `sources name ${id}`);
  }
  assert.ok(snapshot.gaps.length > 0);
});

test("the runtime snapshot module reads the committed file and never the network", () => {
  const src = new URL("../src/", import.meta.url);
  const modules = readdirSync(src).filter((file) => file.endsWith(".ts"));
  assert.ok(modules.length >= 4, "every runtime module is checked, not a pinned list");
  for (const file of modules) {
    const source = readFileSync(new URL(file, src), "utf8").toLowerCase();
    for (const forbidden of ["fetch(", "node:http", "undici", "convex", "openai", "anthropic"]) {
      assert.equal(source.includes(forbidden), false, `src/${file} must not reference ${forbidden}`);
    }
  }
});
