import assert from "node:assert/strict";
import { test } from "node:test";

import * as THREE from "three";

import type { CandidateLamp } from "@repo/scoring";

import { COLUMN_RADIUS, type MapMark, columnHeight } from "./map-view.ts";
import { type LampColours, groundLines, markMeshes, mountSkyline } from "./skyline-scene.ts";
import { groundOutlines } from "./us-ground.ts";

/**
 * The canvas itself (issue #69 / #68). three.js builds a scene without asking
 * for a WebGL context, so what the skyline is made of — how many instances, how
 * tall, what hue, which shape — is checkable here rather than only in a browser.
 *
 * Each lamp word takes a hue of its own in this fixture, including the two
 * coverage states the stylesheet greys alike, so a mesh coloured by the wrong
 * lamp is visible to the assertions.
 */
const COLOURS: LampColours = {
  "Strong candidate": new THREE.Color("#4cb782"),
  "Mixed vector": new THREE.Color("#d9a13a"),
  "Weak candidate": new THREE.Color("#c2685e"),
  "Partial inputs": new THREE.Color("#8a8f98"),
  "No data": new THREE.Color("#616671"),
};

function column(iata: string, lamp: CandidateLamp, composite: number, x: number): MapMark {
  return {
    iata,
    name: iata,
    lamp,
    composite,
    shape: "column",
    height: columnHeight(composite),
    x,
    z: -x,
  };
}

function ring(iata: string, lamp: CandidateLamp, x: number): MapMark {
  return { iata, name: iata, lamp, composite: null, shape: "ring", height: 0, x, z: -x };
}

const SKYLINE: readonly MapMark[] = [
  column("BOS", "Strong candidate", 80, 1),
  column("SEA", "Strong candidate", 72, 2),
  column("MCO", "Mixed vector", 55, 3),
  column("LAX", "Weak candidate", 40, 4),
  ring("HYA", "Partial inputs", 5),
  ring("GUM", "No data", 6),
];

/** The one mesh drawing a lamp word, found by the hue only that word lights. */
function meshFor(meshes: readonly THREE.InstancedMesh[], lamp: CandidateLamp): THREE.InstancedMesh {
  const hue = COLOURS[lamp].getHexString();
  const found = meshes.filter(
    (mesh) => (mesh.material as THREE.MeshLambertMaterial).color.getHexString() === hue,
  );
  assert.equal(found.length, 1, `one mesh for ${lamp}`);
  return found[0];
}

/**
 * Where one instance stands and how it is stretched, read straight off its
 * matrix. The scene writes scale and translation only, and `decompose` reports
 * a unit scale for a degenerate one — it cannot tell a flat ring from a column
 * flattened to nothing, which is exactly the difference under test.
 */
function placement(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const cell = matrix.elements;
  return {
    position: { x: cell[12], y: cell[13], z: cell[14] },
    scale: { x: cell[0], y: cell[5], z: cell[10] },
  };
}

test("every mark is drawn exactly once, in a mesh of its own shape and lamp", () => {
  const meshes = markMeshes(SKYLINE, COLOURS);

  // Five lamp words over two shapes: the fixture has one group per lamp.
  assert.equal(meshes.length, 5);
  assert.equal(
    meshes.reduce((total, mesh) => total + mesh.count, 0),
    SKYLINE.length,
  );
  assert.equal(meshFor(meshes, "Strong candidate").count, 2);
  for (const lamp of ["Mixed vector", "Weak candidate", "Partial inputs", "No data"] as const) {
    assert.equal(meshFor(meshes, lamp).count, 1, lamp);
  }
});

test("a column stands on the ground at its own point, as tall as its composite", () => {
  const strong = meshFor(markMeshes(SKYLINE, COLOURS), "Strong candidate");
  const [boston, seattle] = [placement(strong, 0), placement(strong, 1)];

  assert.equal(boston.position.y, 0, "a column stands on the ground plane, not in it");
  assert.deepEqual([boston.position.x, boston.position.z], [1, -1]);
  assert.ok(Math.abs(boston.scale.y - columnHeight(80)) < 1e-6);
  // Linear all the way to the mesh: two columns stand as their composites do.
  assert.ok(Math.abs(boston.scale.y / seattle.scale.y - 80 / 72) < 1e-6);
});

test("every column is the one radius: nothing is scaled sideways", () => {
  const meshes = markMeshes(SKYLINE, COLOURS);

  for (const lamp of ["Strong candidate", "Mixed vector", "Weak candidate"] as const) {
    const mesh = meshFor(meshes, lamp);
    const geometry = mesh.geometry as THREE.CylinderGeometry;
    assert.equal(geometry.parameters.radiusTop, COLUMN_RADIUS, lamp);
    assert.equal(geometry.parameters.radiusBottom, COLUMN_RADIUS, lamp);
    for (let index = 0; index < mesh.count; index += 1) {
      const { scale } = placement(mesh, index);
      assert.deepEqual([scale.x, scale.z], [1, 1], `${lamp} instance ${index}`);
    }
  }
});

test("a withheld composite lies flat in its own hue, never the weak column's", () => {
  const meshes = markMeshes(SKYLINE, COLOURS);

  for (const lamp of ["Partial inputs", "No data"] as const) {
    const mesh = meshFor(meshes, lamp);
    assert.ok(mesh.geometry instanceof THREE.RingGeometry, `${lamp} draws a ring`);

    const { position, scale } = placement(mesh, 0);
    // No height to read: a ring is not a short column, so nothing stretches it.
    assert.equal(scale.y, 1, lamp);
    assert.ok(position.y > 0 && position.y < 0.05, "clear of the ground lines, not above them");

    const weak = (meshFor(meshes, "Weak candidate").material as THREE.MeshLambertMaterial).color;
    assert.notEqual(
      (mesh.material as THREE.MeshLambertMaterial).color.getHexString(),
      weak.getHexString(),
    );
  }
});

test("a mesh's shape is the group's own, not one guessed from its lamp word", () => {
  // Today a ring's lamp is always a coverage state, so shape follows from the
  // lamp — but the mesh a mark lands in must not lean on that: a lamp word
  // arriving on both shapes has to be drawn as both.
  const meshes = markMeshes(
    [column("BOS", "Partial inputs", 80, 1), ring("HYA", "Partial inputs", 2)],
    COLOURS,
  );

  assert.equal(meshes.length, 2);
  assert.deepEqual(
    meshes.map((mesh) => mesh.geometry.type).sort(),
    ["CylinderGeometry", "RingGeometry"],
  );
});

test("the country is the committed outline, whole and flat on the ground", () => {
  const outlines = groundOutlines();
  const segments = groundLines(outlines, new THREE.Color("#8a8f98"));
  const position = segments.geometry.getAttribute("position");

  // Two vertices per adjacent pair of points: no state and no ring dropped.
  const expected = outlines.reduce(
    (total, outline) =>
      total + outline.rings.reduce((ring, points) => ring + 2 * (points.length - 1), 0),
    0,
  );
  assert.equal(position.count, expected);
  for (let index = 0; index < position.count; index += 1) {
    assert.equal(position.getY(index), 0);
  }
});

test("no WebGL context is a null mount, which is the empty state's signal", () => {
  // Node gives the renderer no document to make a canvas in, which is the same
  // failed context request a browser with WebGL turned off hands over: the
  // mount reports it as null rather than throwing at the component.
  const host = {} as HTMLElement;

  assert.equal(mountSkyline(host, { marks: SKYLINE, outlines: [], reducedMotion: true }), null);
});
