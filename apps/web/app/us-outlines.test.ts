import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreUniverse } from "@repo/scoring";
import { loadSnapshot } from "@repo/snapshot";

import { US_STATES } from "./us-outlines.ts";

test("the committed geometry is fifty states, DC and Puerto Rico", () => {
  assert.equal(US_STATES.length, 52);

  const codes = US_STATES.map((state) => state.state);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) {
    assert.match(code, /^[A-Z]{2}$/);
  }
});

test("every state an airport in the screen sits in has an outline under it", () => {
  const drawn = new Set(US_STATES.map((state) => state.state));
  const uncovered = new Set<string>();

  for (const row of scoreUniverse(loadSnapshot())) {
    if (!drawn.has(row.state)) uncovered.add(row.state);
  }
  // #73: Pacific and Caribbean primaries stay at true coordinates with no extra
  // inset. The committed outlines are the fifty states, DC and Puerto Rico, so
  // these four have no ring under them rather than a fake one at 0,0.
  assert.deepEqual([...uncovered].toSorted(), ["AS", "GU", "MP", "VI"]);
});

test("each outline is a closed ring of real degrees, not a stray point", () => {
  for (const { state, rings } of US_STATES) {
    assert.ok(rings.length > 0, state);
    for (const ring of rings) {
      assert.ok(ring.length >= 4, `${state} ring length`);
      assert.deepEqual(ring.at(0), ring.at(-1), `${state} ring is closed`);
      for (const [longitude, latitude] of ring) {
        assert.ok(latitude >= 17 && latitude <= 72, `${state} latitude ${latitude}`);
        // The Aleutians stay unwrapped past -180 rather than jumping to +170:
        // on a flat ground plane a wrapped ring would draw a line across the
        // whole country.
        assert.ok(longitude >= -190 && longitude <= -64, `${state} longitude ${longitude}`);
      }
    }
  }
});
