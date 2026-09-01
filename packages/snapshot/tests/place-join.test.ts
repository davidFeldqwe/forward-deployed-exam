import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coordinatesOf,
  placeFor,
  stateOf,
  type Place,
  type PlaceIndex,
} from "../scripts/lib/ourairports.ts";

// Identity fixtures: the join is about which airport a code reaches, so these
// carry no coordinates. `coordinatesOf` below is where the pair is tested.
const nowhere = { latitude: null, longitude: null };

function place(
  iata: string,
  ident: string,
  name: string,
  municipality: string,
  state: string,
): Place {
  return { iata, ident, name, municipality, state, ...nowhere };
}

const LAX = place("LAX", "KLAX", "Los Angeles International Airport", "Los Angeles", "CA");
const DJT = place("DJT", "KPBI", "Palm Beach International Airport", "West Palm Beach", "FL");
const DCA = place("DCA", "KDCA", "Ronald Reagan Washington National Airport", "Washington", "DC");
const SJU = place("SJU", "TJSJ", "Luis Munoz Marin International Airport", "San Juan", "PR");
const MCO = place("MCO", "KMCO", "Orlando International Airport", "Orlando", "TX");
// Mesa Gateway is FAA locid IWA and IATA code AZA; IWA as an IATA code is an
// airport in Russia, which is not in a US places index at all.
const AZA = place("AZA", "KIWA", "Mesa Gateway Airport", "Mesa", "AZ");
// Boulder City is FAA locid BVU, while BVU as an IATA code is a village strip
// in Alaska. Both are in the index, so only the state tells them apart.
const BLD = place("BLD", "KBVU", "Boulder City Municipal Airport", "Boulder City", "NV");
const BVU = place("BVU", "PABG", "Beluga Airport", "Beluga", "AK");
// A US local code whose row publishes no IATA code, so there is nothing to key on.
const UNKEYED = place("", "K61B", "Unkeyed Field", "Nowhere", "NV");

const places: PlaceIndex = {
  byIata: new Map([LAX, DJT, DCA, SJU, MCO, BVU].map((row) => [row.iata, row])),
  byLocalCode: new Map([
    ["LAX", LAX],
    ["PBI", DJT],
    ["IWA", AZA],
    ["BVU", BLD],
    ["UNK", UNKEYED],
  ]),
};

test("an IATA code joins straight to its OurAirports place", () => {
  assert.equal(placeFor("LAX", "CA", places).ident, "KLAX");
});

test("the documented alias keeps the FAA/BTS code as the key", () => {
  const palmBeach = placeFor("PBI", "FL", places);
  assert.equal(palmBeach.municipality, "West Palm Beach");
  assert.equal(palmBeach.iata, "PBI", "the snapshot keys on the code FAA and BTS publish");
});

test("a code with no OurAirports row fails instead of dropping the airport", () => {
  assert.throws(() => placeFor("XXX", "CA", places), /XXX/);
});

test("a place in the wrong state fails, so a reassigned code is never joined silently", () => {
  assert.throws(() => placeFor("MCO", "FL", places), /MCO/);
});

test("the one airport the two sources file in different states is named, not guessed", () => {
  assert.equal(placeFor("DCA", "VA", places).municipality, "Washington");
  assert.throws(() => placeFor("DCA", "MD", places), /DCA/);
});

// #73: the FAA workbook gives a locid, and for a few dozen primaries that is not
// the IATA code. The place is then found on the FAA local code, and the IATA
// code the row publishes is what the snapshot and BTS key on.
test("a locid that is not an IATA code joins on the local code and brings its IATA", () => {
  const mesa = placeFor("IWA", "AZ", places);
  assert.equal(mesa.ident, "KIWA");
  assert.equal(mesa.iata, "AZA", "BTS files Mesa Gateway under AZA, never under the locid");
});

test("a locid another airport holds as an IATA code is told apart by the state", () => {
  // BVU reaches Beluga, Alaska as an IATA code and Boulder City, Nevada as a
  // local code. The FAA state picks, so neither answer is by luck of order.
  assert.equal(placeFor("BVU", "NV", places).iata, "BLD");
  assert.equal(placeFor("BVU", "AK", places).iata, "BVU");
  assert.throws(() => placeFor("BVU", "CA", places), /BVU/);
});

test("a local-code join with no IATA code to key on fails rather than keying on nothing", () => {
  assert.throws(() => placeFor("UNK", "NV", places), /UNK.*IATA/);
});

test("state comes from the iso_region for states and the iso_country for territories", () => {
  assert.equal(stateOf("US", "US-CA"), "CA");
  assert.equal(stateOf("PR", "PR-U-A"), "PR");
  assert.equal(stateOf("GU", "GU-U-A"), "GU");
});

test("a coordinate pair comes back as degrees, so the map reads the source's numbers", () => {
  assert.deepEqual(coordinatesOf("KLAX", "33.94250107", "-118.4079971"), {
    latitude: 33.94250107,
    longitude: -118.4079971,
  });
});

test("half a coordinate is not a point, so a blank stays blank instead of becoming zero", () => {
  assert.deepEqual(coordinatesOf("KXXX", "", "-71.0052"), nowhere);
  assert.deepEqual(coordinatesOf("KXXX", "42.3643", ""), nowhere);
  assert.deepEqual(coordinatesOf("KXXX", "", ""), nowhere);
});

test("a coordinate outside degrees fails loudly rather than placing a marker off the world", () => {
  assert.throws(() => coordinatesOf("KXXX", "91", "-71.0052"), /KXXX/);
  assert.throws(() => coordinatesOf("KXXX", "42.3643", "181"), /KXXX/);
  assert.throws(() => coordinatesOf("KXXX", "north", "-71.0052"), /KXXX/);
});
