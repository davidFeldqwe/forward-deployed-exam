import assert from "node:assert/strict";
import { test } from "node:test";

import { groundPoint } from "./map-view.ts";
import { GROUND_OUTLINES } from "./us-ground.ts";
import { US_STATES } from "./us-outlines.ts";

test("the outline is placed in the columns' own frame, so a column stands on its state", () => {
  assert.equal(GROUND_OUTLINES.length, US_STATES.length);
  const alabama = US_STATES.find((state) => state.state === "AL");
  const drawn = GROUND_OUTLINES.find((outline) => outline.state === "AL");
  assert.ok(alabama && drawn);

  const [longitude, latitude] = alabama.rings[0][0];
  assert.deepEqual(drawn.rings[0][0], groundPoint({ latitude, longitude }));
});
