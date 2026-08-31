import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coordinatesOf,
  placeFor,
  stateOf,
  type Place,
} from "../scripts/lib/ourairports.ts";

// Identity fixtures: the join is about which airport a code reaches, so these
// carry no coordinates. `coordinatesOf` below is where the pair is tested.
const nowhere = { latitude: null, longitude: null };
const places = new Map<string, Place>([
  ["LAX", { ident: "KLAX", name: "Los Angeles International Airport", municipality: "Los Angeles", state: "CA", ...nowhere }],
  ["DJT", { ident: "KPBI", name: "Palm Beach International Airport", municipality: "West Palm Beach", state: "FL", ...nowhere }],
  ["DCA", { ident: "KDCA", name: "Ronald Reagan Washington National Airport", municipality: "Washington", state: "DC", ...nowhere }],
  ["SJU", { ident: "TJSJ", name: "Luis Munoz Marin International Airport", municipality: "San Juan", state: "PR", ...nowhere }],
  ["MCO", { ident: "KMCO", name: "Orlando International Airport", municipality: "Orlando", state: "TX", ...nowhere }],
]);

test("an IATA code joins straight to its OurAirports place", () => {
  assert.equal(placeFor("LAX", "CA", places).ident, "KLAX");
});

test("the documented alias keeps the FAA/BTS code as the key", () => {
  assert.equal(placeFor("PBI", "FL", places).municipality, "West Palm Beach");
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
