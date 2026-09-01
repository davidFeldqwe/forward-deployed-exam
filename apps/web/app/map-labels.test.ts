import assert from "node:assert/strict";
import { test } from "node:test";

import { CONUS_VIEW, MIN_DISTANCE } from "./map-camera.ts";
import {
  IATA_LABEL_CAP,
  iataLabels,
  labelFade,
} from "./map-labels.ts";

const openingDistance = Math.hypot(
  CONUS_VIEW.position.x - CONUS_VIEW.target.x,
  CONUS_VIEW.position.y - CONUS_VIEW.target.y,
  CONUS_VIEW.position.z - CONUS_VIEW.target.z,
);

function mark(iata: string, x: number, z = 0) {
  return { iata, x, height: 1, z };
}

const crowd = Array.from({ length: 28 }, (_, index) => mark(`A${String(index).padStart(2, "0")}`, index));

test("close zoom fades IATA in; the opening country view has none", () => {
  assert.equal(labelFade(openingDistance), 0);
  assert.equal(labelFade(MIN_DISTANCE), 1);
  assert.ok(labelFade((openingDistance + MIN_DISTANCE) / 2) > 0);
  assert.ok(labelFade((openingDistance + MIN_DISTANCE) / 2) < 1);
});

test("close zoom labels the nearest capped set in the frustum, and zoom out removes them", () => {
  const camera = { x: 0, y: 4, z: 4 };
  const inView = iataLabels(crowd, {
    distance: MIN_DISTANCE,
    camera,
    inFrustum: () => true,
  });

  assert.equal(inView.length, IATA_LABEL_CAP);
  assert.equal(IATA_LABEL_CAP, 20);
  assert.deepEqual(
    inView,
    crowd.slice(0, IATA_LABEL_CAP).map((column) => column.iata),
  );

  const zoomedOut = iataLabels(crowd, {
    distance: openingDistance,
    camera,
    inFrustum: () => true,
  });
  assert.deepEqual(zoomedOut, []);
});

test("a column outside the frustum is not labelled, even when nearer than one inside it", () => {
  const camera = { x: 0, y: 2, z: 0 };
  const labeled = iataLabels([mark("NEAR", 0.2), mark("FAR", 8)], {
    distance: MIN_DISTANCE,
    camera,
    inFrustum: (point) => point.x > 1,
  });
  assert.deepEqual(labeled, ["FAR"]);
});
