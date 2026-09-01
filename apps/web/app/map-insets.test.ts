import assert from "node:assert/strict";
import { test } from "node:test";

import * as THREE from "three";

import { scoreUniverse } from "@repo/scoring";
import { loadSnapshot } from "@repo/snapshot";

import {
  CONUS_VIEW,
  FIELD_OF_VIEW,
  MAX_POLAR_ANGLE,
  MIN_DISTANCE,
  MIN_POLAR_ANGLE,
  type ScenePoint,
  farLimit,
} from "./map-camera.ts";
import {
  INSET_REGIONS,
  type InsetRegion,
  MAIN_LAYER,
  insetAt,
  insetFrame,
  insetRects,
  layerAt,
  layerOfState,
} from "./map-insets.ts";
import { mapMarks } from "./map-view.ts";
import { GROUND_OUTLINES } from "./us-ground.ts";

/**
 * The atlas insets (issue #72 / #68): Alaska and Hawaii in corner viewports of
 * the one renderer. Everything the canvas needs to draw them — which places,
 * where the boxes sit, which frame a click flies to — is decided here, so it is
 * checkable without a WebGL context.
 */

/** The pane shapes the map is drawn in, from an ultrawide desk to a phone. */
const PANES = [
  { width: 2560, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 780 },
  { width: 320, height: 480 },
];

/** The region an inset is of, by name. */
function region(key: string): InsetRegion {
  const found = INSET_REGIONS.find((candidate) => candidate.key === key);
  assert.ok(found, `${key} is an inset`);
  return found;
}

/** Every point of a region's committed outline, on the y = 0 plane. */
function outlinePoints(one: InsetRegion): THREE.Vector3[] {
  const drawn = GROUND_OUTLINES.filter((outline) => one.states.includes(outline.state));
  return drawn.flatMap((outline) =>
    outline.rings.flatMap((ring) => ring.map(({ x, z }) => new THREE.Vector3(x, 0, z))),
  );
}

/** The top of every column the screen stands up inside that region. */
function columnTops(one: InsetRegion): THREE.Vector3[] {
  const rows = scoreUniverse(loadSnapshot()).filter((row) => one.states.includes(row.state ?? ""));
  const marks = mapMarks(rows);
  assert.ok(marks.length > 0, `${one.key} has airports in the screen`);
  return marks.map((mark) => new THREE.Vector3(mark.x, mark.height, mark.z));
}

/** The camera an inset viewport of this shape is drawn through. */
function insetCamera(one: InsetRegion, aspect: number): THREE.PerspectiveCamera {
  const { position, target } = insetFrame(one, aspect);
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, aspect, 0.1, 400);
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(target.x, target.y, target.z);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Where a point sits relative to a frame's target: how far, and how high. */
function orbitOf(position: ScenePoint, target: ScenePoint): { distance: number; polar: number } {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const distance = Math.hypot(dx, dy, dz);
  return { distance, polar: Math.acos(dy / distance) };
}

test("the atlas is Alaska and Hawaii, and no other place", () => {
  assert.deepEqual(
    INSET_REGIONS.map((one) => one.key),
    ["alaska", "hawaii"],
  );
  assert.deepEqual(
    INSET_REGIONS.map((one) => [...one.states]),
    [["AK"], ["HI"]],
  );

  // Puerto Rico, the Virgin Islands, Guam and American Samoa stay in the
  // snapshot at true coordinates and get no inset of their own.
  for (const state of ["PR", "VI", "GU", "AS", "MP", "CA", "NY"]) {
    assert.equal(layerOfState(state), MAIN_LAYER, state);
  }
});

test("each inset draws on a layer of its own, and the country on the main one", () => {
  const layers = INSET_REGIONS.map((one) => one.layer);

  assert.equal(new Set(layers).size, layers.length, "no two insets share a layer");
  assert.equal(layers.includes(MAIN_LAYER), false, "and none of them is the country's");
  for (const one of INSET_REGIONS) {
    for (const state of one.states) {
      assert.equal(layerOfState(state), one.layer, state);
    }
  }
});

test("an airport is drawn in the inset its own coordinates fall in", () => {
  const rows = scoreUniverse(loadSnapshot());
  const marks = new Map(mapMarks(rows).map((mark) => [mark.iata, mark]));
  const layerOf = (iata: string) => {
    const mark = marks.get(iata);
    assert.ok(mark, iata);
    return layerAt(mark);
  };

  assert.equal(layerOf("ANC"), region("alaska").layer);
  for (const iata of ["HNL", "OGG", "KOA", "LIH"]) {
    assert.equal(layerOf(iata), region("hawaii").layer, iata);
  }
  // San Juan is in the snapshot at its own coordinates, and in no inset.
  for (const iata of ["SJU", "LAX", "BOS", "SEA"]) {
    assert.equal(layerOf(iata), MAIN_LAYER, iata);
  }
});

test("an inset holds its whole region: every outline point and every column top", () => {
  // The inset is the only view of Alaska and Hawaii the opening frame gives, so
  // a frame that cut the Aleutians or Kauai off would lose them from the page.
  for (const one of INSET_REGIONS) {
    const points = [...outlinePoints(one), ...columnTops(one)];
    for (const pane of PANES) {
      // The shape the region is actually drawn in: its own box on this pane.
      const rect = insetRects(pane).find((box) => box.region.key === one.key);
      assert.ok(rect, one.key);
      const aspect = rect.width / rect.height;
      const camera = insetCamera(one, aspect);
      for (const point of points) {
        const ndc = point.clone().project(camera);
        const worst = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
        assert.ok(worst <= 1, `${one.key} at ${aspect.toFixed(2)}: ${worst.toFixed(2)} off centre`);
      }
    }
  }
});

test("an inset is seen from the same tilt the country is, so a column is a column", () => {
  // Not a plan view: height is the composite score, and an inset that looked
  // straight down would draw a lamp-coloured dot instead of a column.
  const base = orbitOf(CONUS_VIEW.position, CONUS_VIEW.target);

  for (const one of INSET_REGIONS) {
    for (const aspect of [2.4, 1.7, 1, 0.8]) {
      const frame = insetFrame(one, aspect);
      const seen = orbitOf(frame.position, frame.target);

      assert.equal(frame.target.y, 0, "the frame looks at the ground plane");
      assert.ok(Math.abs(seen.polar - base.polar) < 1e-9, `${one.key}: the country's own tilt`);
    }
  }
});

test("the frame a click flies to is somewhere the orbit could have been put", () => {
  // Clicking an inset eases the main camera there; an endpoint outside the
  // orbit's own limits would be clamped away on the frame after it arrived.
  for (const one of INSET_REGIONS) {
    for (const aspect of [2.4, 1.78, 1.33, 1, 0.75, 0.62, 0.5, 0.4, 0.33]) {
      const frame = insetFrame(one, aspect);
      const { distance, polar } = orbitOf(frame.position, frame.target);

      assert.ok(polar >= MIN_POLAR_ANGLE && polar <= MAX_POLAR_ANGLE, `${one.key}: ${polar}`);
      assert.ok(distance >= MIN_DISTANCE, `${one.key} at ${aspect}: ${distance}`);
      assert.ok(distance <= farLimit(aspect) + 1e-9, `${one.key} at ${aspect}: ${distance}`);
    }
  }
});

test("both insets sit in the pane's corner, side by side and clear of each other", () => {
  for (const pane of PANES) {
    const rects = insetRects(pane);
    assert.equal(rects.length, INSET_REGIONS.length, `${pane.width}x${pane.height}`);

    for (const rect of rects) {
      assert.ok(rect.width >= 1 && rect.height >= 1, "a viewport of no size draws nothing");
      assert.ok(rect.x >= 0 && rect.x + rect.width <= pane.width, "inside the pane, left to right");
      assert.ok(rect.y >= 0 && rect.y + rect.height <= pane.height, "and top to bottom");
    }

    // A corner, not a half: the country is what the page is mostly of.
    const covered = rects.reduce((total, rect) => total + rect.width * rect.height, 0);
    assert.ok(covered < pane.width * pane.height * 0.25, "the insets stay a corner of the pane");

    const [first, second] = rects;
    assert.ok(first.x + first.width < second.x, "side by side, with a gap between them");
    assert.equal(first.y, second.y, "on one line");
    // The bottom-left corner, where an atlas puts them.
    assert.ok(first.x < pane.width / 2);
    assert.ok(first.y + first.height > pane.height / 2);
  }
});

test("a click inside an inset is that region's; one on the country is nobody's", () => {
  const pane = { width: 1280, height: 720 };
  const rects = insetRects(pane);
  const at = (x: number, y: number) => insetAt(rects, { x, y })?.region.key ?? null;

  for (const rect of rects) {
    assert.equal(at(rect.x + rect.width / 2, rect.y + rect.height / 2), rect.region.key);
    assert.equal(at(rect.x, rect.y), rect.region.key, "the corner is inside the box");
  }
  // The skyline itself, the gap between the boxes, and the space above them.
  assert.equal(at(pane.width / 2, pane.height / 2), null);
  assert.equal(at(rects[0].x + rects[0].width + 2, rects[0].y + 4), null);
  assert.equal(at(rects[0].x + 4, rects[0].y - 4), null);
});
