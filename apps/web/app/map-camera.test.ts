import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CONUS_VIEW,
  INTRO_MS,
  MAX_DISTANCE,
  MAX_POLAR_ANGLE,
  MIN_DISTANCE,
  MIN_POLAR_ANGLE,
  easeOut,
  introEase,
} from "./map-camera.ts";

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

test("the orbit cannot go under the ground, or stand straight up on it", () => {
  // Polar angle is measured from straight up, so half pi is level with the
  // ground plane and anything past it is under the country.
  assert.ok(MAX_POLAR_ANGLE < Math.PI / 2);
  assert.ok(MIN_POLAR_ANGLE > 0);
  assert.ok(MIN_POLAR_ANGLE < MAX_POLAR_ANGLE);
});

test("scroll zoom is bounded at both ends, so the skyline cannot be lost", () => {
  assert.ok(MIN_DISTANCE > 0);
  assert.ok(MIN_DISTANCE < MAX_DISTANCE);
});

test("the default frame is a tilt over the contiguous states, above the ground", () => {
  assert.ok(CONUS_VIEW.position.y > 0, "the camera is above the ground plane");
  // Looking at the country, not past it: the target sits on the ground.
  assert.equal(CONUS_VIEW.target.y, 0);
  // Tilted, not straight down: a skyline needs to be seen from the side.
  assert.ok(CONUS_VIEW.position.z > 0);
});

test("the first load eases into that frame, in under about a second", () => {
  const intro = introEase(false);

  assert.deepEqual(intro.to, CONUS_VIEW.position);
  assert.notDeepEqual(intro.from, intro.to);
  assert.ok(intro.durationMs > 0);
  assert.ok(intro.durationMs <= 1000);
  assert.equal(intro.durationMs, INTRO_MS);
});

test("reduced motion opens on the tilted view instead of flying into it", () => {
  const intro = introEase(true);

  assert.equal(intro.durationMs, 0);
  assert.deepEqual(intro.from, CONUS_VIEW.position);
  assert.deepEqual(intro.to, CONUS_VIEW.position);
});

test("the ease arrives rather than stopping, and is bounded at both ends", () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  // Out, not in: most of the distance is covered early.
  assert.ok(easeOut(0.5) > 0.5);
  for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    assert.ok(easeOut(t) > easeOut(t - 0.1));
  }
});

test("the scene takes its limits from this module, and never pans off the ground", () => {
  const scene = source("app/skyline-scene.ts");

  assert.match(scene, /minPolarAngle = MIN_POLAR_ANGLE/);
  assert.match(scene, /maxPolarAngle = MAX_POLAR_ANGLE/);
  assert.match(scene, /minDistance = MIN_DISTANCE/);
  assert.match(scene, /maxDistance = MAX_DISTANCE/);
  // Pan would carry the target off the plane the columns stand on, and an
  // orbit with the world's up vector is what keeps the country from rolling.
  assert.match(scene, /enablePan = false/);
  assert.doesNotMatch(scene, /\broll\b|rotation\.z/);
});

test("the ease the scene runs is this module's, and it asks the visitor first", () => {
  assert.match(source("app/skyline-scene.ts"), /introEase\(input\.reducedMotion\)/);
  assert.match(
    source("components/SkylineCanvas.tsx"),
    /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/,
  );
});
