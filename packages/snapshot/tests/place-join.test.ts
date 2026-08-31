import assert from "node:assert/strict";
import { test } from "node:test";

import { placeFor, stateOf, type Place } from "../scripts/lib/ourairports.ts";

const places = new Map<string, Place>([
  ["LAX", { ident: "KLAX", name: "Los Angeles International Airport", municipality: "Los Angeles", state: "CA" }],
  ["DJT", { ident: "KPBI", name: "Palm Beach International Airport", municipality: "West Palm Beach", state: "FL" }],
  ["DCA", { ident: "KDCA", name: "Ronald Reagan Washington National Airport", municipality: "Washington", state: "DC" }],
  ["SJU", { ident: "TJSJ", name: "Luis Munoz Marin International Airport", municipality: "San Juan", state: "PR" }],
  ["MCO", { ident: "KMCO", name: "Orlando International Airport", municipality: "Orlando", state: "TX" }],
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
