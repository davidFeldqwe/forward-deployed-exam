import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as THREE from "three";

import { scoreUniverse } from "@repo/scoring";
import { loadSnapshot } from "@repo/snapshot";

import {
  CONUS_HALF_WIDTH,
  CONUS_VIEW,
  FIELD_OF_VIEW,
  MAX_DISTANCE,
  MAX_POLAR_ANGLE,
  MIN_DISTANCE,
  MIN_POLAR_ANGLE,
  WORLD_REACH,
  easeOut,
  farLimit,
  farPlane,
  introEase,
  openingPosition,
  type ScenePoint,
} from "./map-camera.ts";
import { mapMarks } from "./map-view.ts";
import { groundOutlines } from "./us-ground.ts";

const web = new URL("../", import.meta.url);

/**
 * The shapes the canvas pane comes in, from an ultrawide desktop down to the
 * tall sliver a phone leaves between the bar and the key — and past it, to a
 * browser window dragged narrow or a split-screen pane beside another app.
 */
const ASPECTS = [2.4, 1.78, 1.33, 1, 0.75, 0.62, 0.5, 0.4, 0.33];

/**
 * Alaska, Hawaii and Puerto Rico. The opening frame is the contiguous states —
 * the inset viewports that would carry the rest are #68's follow-on — so those
 * three are outside it by design, and reachable by orbiting out to them.
 */
const OFF_FRAME = new Set(["AK", "HI", "PR"]);

/**
 * Everything the opening frame is supposed to hold: the country's own outline,
 * and the top of every column standing on it. A column's height is what a
 * frame chosen from the ground alone would clip first.
 */
function contiguousPoints(): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const outline of groundOutlines()) {
    if (OFF_FRAME.has(outline.state)) continue;
    for (const ring of outline.rings) {
      for (const point of ring) points.push(new THREE.Vector3(point.x, 0, point.z));
    }
  }
  const rows = scoreUniverse(loadSnapshot()).filter((row) => !OFF_FRAME.has(row.state ?? ""));
  for (const mark of mapMarks(rows)) {
    points.push(new THREE.Vector3(mark.x, mark.height, mark.z));
  }
  return points;
}

/** The camera as the scene builds it, in the frame this module opens on. */
function openingCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, aspect, 0.1, farPlane(aspect));
  const { x, y, z } = openingPosition(aspect);
  camera.position.set(x, y, z);
  camera.lookAt(CONUS_VIEW.target.x, CONUS_VIEW.target.y, CONUS_VIEW.target.z);
  camera.updateMatrixWorld(true);
  return camera;
}

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

/** Where a point sits relative to the orbit's target: how far, and how high. */
function orbitOf(point: ScenePoint): { distance: number; polar: number } {
  const dx = point.x - CONUS_VIEW.target.x;
  const dy = point.y - CONUS_VIEW.target.y;
  const dz = point.z - CONUS_VIEW.target.z;
  const distance = Math.hypot(dx, dy, dz);
  return { distance, polar: Math.acos(dy / distance) };
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

test("the opening frame holds the whole contiguous country, on a phone as on a laptop", () => {
  // A fixed distance frames the country on a wide pane and cuts both coasts off
  // a narrow one: half the frustum's width is the aspect times its height, so
  // the frame has to be chosen against the pane it is drawn into.
  const points = contiguousPoints();

  for (const aspect of ASPECTS) {
    const camera = openingCamera(aspect);
    for (const point of points) {
      const ndc = point.clone().project(camera);
      const worst = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
      assert.ok(worst <= 1, `aspect ${aspect}: a point sits ${worst.toFixed(2)} off centre`);
    }
  }
});

test("the frame's half-width is the committed country's own east–west reach", () => {
  // The frame is centred on x = 0, so what has to fit is the further of the two
  // edges. A constant that drifted from the geometry would frame a country the
  // ground plane no longer draws.
  const reach = Math.max(
    ...groundOutlines()
      .filter((outline) => !OFF_FRAME.has(outline.state))
      .flatMap((outline) => outline.rings.flatMap((ring) => ring.map((point) => Math.abs(point.x)))),
  );

  assert.ok(CONUS_HALF_WIDTH >= reach, `${CONUS_HALF_WIDTH} covers ${reach}`);
  // And no wider: a frame with a country's width of slack in it opens too far out.
  assert.ok(CONUS_HALF_WIDTH - reach < 1);
});

test("a wide pane opens at the module's own frame; a narrow one pulls back from it", () => {
  assert.deepEqual(openingPosition(1.78), CONUS_VIEW.position);
  // Narrower panes only ever move the camera away along the same ray, so the
  // tilt the country is seen at is the one frame for every viewport.
  const portrait = orbitOf(openingPosition(0.62));
  const base = orbitOf(CONUS_VIEW.position);
  assert.ok(portrait.distance > base.distance);
  assert.ok(Math.abs(portrait.polar - base.polar) < 1e-9, "the same angle, further out");
});

test("the first load eases into that frame, in under about a second", () => {
  const intro = introEase(false, 1.78);

  assert.deepEqual(intro.to, CONUS_VIEW.position);
  assert.notDeepEqual(intro.from, intro.to);
  assert.ok(intro.durationMs > 0);
  assert.ok(intro.durationMs <= 1000);
});

test("reduced motion opens on the tilted view instead of flying into it", () => {
  for (const aspect of ASPECTS) {
    const intro = introEase(true, aspect);

    assert.equal(intro.durationMs, 0);
    // The finished frame, and the one the pane is wide enough for: a visitor
    // who asked for less motion is not also given a narrower country.
    assert.deepEqual(intro.from, openingPosition(aspect));
    assert.deepEqual(intro.to, openingPosition(aspect));
  }
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

test("the ease steps back before it comes in, on every pane", () => {
  // The move is a step out and a tilt in. A far limit that did not grow with
  // the frame would pin the start on top of the finish on a narrow pane: the
  // canvas would hold still for the ease's whole duration and then open on a
  // country with its coasts cut off.
  for (const aspect of ASPECTS) {
    const intro = introEase(false, aspect);
    const from = orbitOf(intro.from);
    const to = orbitOf(intro.to);

    assert.ok(
      from.distance > to.distance * 1.1,
      `aspect ${aspect}: ${from.distance.toFixed(1)} is not a step back from ${to.distance.toFixed(1)}`,
    );
  }
});

test("the ease starts and ends somewhere the orbit could have been put", () => {
  // An endpoint outside the limits would be clamped by the controls on the very
  // first frame, so the opening move would fight the constraint rather than run.
  // A narrow pane opens further out, so the claim is made at every aspect.
  for (const aspect of ASPECTS) {
    const intro = introEase(false, aspect);
    for (const point of [intro.from, intro.to]) {
      const { distance, polar } = orbitOf(point);
      assert.ok(polar >= MIN_POLAR_ANGLE, `aspect ${aspect}: polar ${polar}`);
      assert.ok(polar <= MAX_POLAR_ANGLE, `aspect ${aspect}: polar ${polar}`);
      assert.ok(distance >= MIN_DISTANCE, `aspect ${aspect}: distance ${distance}`);
      // The ease starts exactly at the far limit on a narrow pane, so the two
      // are compared with a rounding trip's worth of slack rather than exactly.
      assert.ok(distance <= farLimit(aspect) + 1e-9, `aspect ${aspect}: distance ${distance}`);
    }
  }
});

test("scroll can always reach the frame the map opened in", () => {
  // A far limit nearer than the opening frame is the controls clamping the
  // country's coasts off a narrow pane on the first update, and again every
  // time the visitor zooms out to look for them.
  for (const aspect of ASPECTS) {
    const opening = orbitOf(openingPosition(aspect)).distance;

    assert.ok(farLimit(aspect) >= opening, `aspect ${aspect}: ${farLimit(aspect)} < ${opening}`);
    assert.ok(farLimit(aspect) >= MAX_DISTANCE, `aspect ${aspect}: nearer than a wide pane's`);
    assert.ok(farLimit(aspect) > MIN_DISTANCE);
  }
  // A wide pane is not pushed out by a rule written for a narrow one.
  assert.equal(farLimit(1.78), MAX_DISTANCE);
});

test("the camera can see the whole world from the furthest the orbit may stand", () => {
  // Everything drawn, ground and columns alike, measured from the orbit's own
  // target: the Aleutians are the furthest of it. A far plane short of the
  // limit plus this would clip the country out of the frame it opened in.
  const target = new THREE.Vector3(CONUS_VIEW.target.x, CONUS_VIEW.target.y, CONUS_VIEW.target.z);
  const reach = Math.max(
    ...groundOutlines().flatMap((outline) =>
      outline.rings.flatMap((ring) =>
        ring.map((point) => new THREE.Vector3(point.x, 0, point.z).distanceTo(target)),
      ),
    ),
    ...mapMarks(scoreUniverse(loadSnapshot())).map((mark) =>
      new THREE.Vector3(mark.x, mark.height, mark.z).distanceTo(target),
    ),
  );

  assert.ok(WORLD_REACH >= reach, `${WORLD_REACH} covers ${reach}`);
  for (const aspect of ASPECTS) {
    assert.ok(farPlane(aspect) >= farLimit(aspect) + reach, `aspect ${aspect}`);
  }
});

test("the scene takes its limits from this module, and never pans off the ground", () => {
  const scene = source("app/skyline-scene.ts");

  assert.match(scene, /minPolarAngle = MIN_POLAR_ANGLE/);
  assert.match(scene, /maxPolarAngle = MAX_POLAR_ANGLE/);
  assert.match(scene, /minDistance = MIN_DISTANCE/);
  // The far limit and the far plane are the pane's, not one number for all of
  // them, and both are taken again when the pane changes shape.
  assert.match(scene, /maxDistance = farLimit\(camera\.aspect\)/);
  // Pan would carry the target off the plane the columns stand on, and an
  // orbit with the world's up vector is what keeps the country from rolling.
  assert.match(scene, /enablePan = false/);
  assert.doesNotMatch(scene, /\broll\b|rotation\.z/);
});

test("the scene frames against its own pane, and keeps a view the visitor set", () => {
  const scene = source("app/skyline-scene.ts");

  // One field of view, and the aspect the canvas is actually drawn at: a camera
  // built with a fixed pair would frame a pane the page does not have.
  assert.match(scene, /const aspect = hostAspect\(host\);/);
  assert.match(scene, /PerspectiveCamera\(FIELD_OF_VIEW, aspect, 0\.1, farPlane\(aspect\)\)/);
  assert.match(scene, /openingPosition\(camera\.aspect\)/);
  assert.match(scene, /camera\.far = farPlane\(camera\.aspect\)/);
  // A resize re-frames only while nothing has been dragged or zoomed — but how
  // far out the country can be held is the new pane's, whoever is driving.
  assert.match(scene, /untouched = false/);
  assert.match(scene, /if \(!untouched\)/);
  assert.match(scene, /maxDistance = farLimit\(camera\.aspect\);\n\s*if \(!untouched\)/);
});

test("the ease the scene runs is this module's, and it asks the visitor first", () => {
  assert.match(source("app/skyline-scene.ts"), /introEase\(input\.reducedMotion, /);
  assert.match(
    source("components/SkylineCanvas.tsx"),
    /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/,
  );
});
