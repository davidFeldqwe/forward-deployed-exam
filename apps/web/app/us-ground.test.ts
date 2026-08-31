import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreUniverse } from "@repo/scoring";
import { loadSnapshot } from "@repo/snapshot";

import { groundPoint } from "./map-view.ts";
import { US_STATES, groundOutlines } from "./us-ground.ts";

test("the ground plane is committed geometry: fifty states, DC and Puerto Rico", () => {
  assert.equal(US_STATES.length, 52);

  const codes = US_STATES.map((state) => state.state);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) {
    assert.match(code, /^[A-Z]{2}$/);
  }
});

test("every state an airport in the screen sits in has an outline under it", () => {
  const drawn = new Set(US_STATES.map((state) => state.state));

  for (const row of scoreUniverse(loadSnapshot())) {
    assert.equal(drawn.has(row.state), true, row.state);
  }
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

test("the outline is placed in the columns' own frame, so a column stands on its state", () => {
  const outlines = groundOutlines();

  assert.equal(outlines.length, US_STATES.length);
  const alabama = US_STATES.find((state) => state.state === "AL");
  const drawn = outlines.find((outline) => outline.state === "AL");
  assert.ok(alabama && drawn);

  const [longitude, latitude] = alabama.rings[0][0];
  assert.deepEqual(drawn.rings[0][0], groundPoint({ latitude, longitude }));
});
