/**
 * The `/map` canvas (issue #69 / #68): three.js drawing what `app/map-view.ts`
 * decided. Nothing is computed here — heights, positions, shapes and lamps all
 * arrive as marks, and the ground outline arrives already placed in the same
 * frame — so a column on screen cannot be a number this module made up.
 *
 * Hue comes off the stylesheet's own custom properties (`lampVariable`), so the
 * skyline and the ranking table light the same token rather than two hex
 * strings that could drift.
 *
 * The one caller is `components/SkylineCanvas.tsx`. `mountSkyline` returns null
 * when the browser gives no WebGL context, which is the empty state's signal.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { CANDIDATE_LAMPS, type CandidateLamp } from "@repo/scoring";

import { lampVariable } from "./lamp-hue.ts";
import {
  CONUS_VIEW,
  FIELD_OF_VIEW,
  MAX_DISTANCE,
  MAX_POLAR_ANGLE,
  MIN_DISTANCE,
  MIN_POLAR_ANGLE,
  type ScenePoint,
  easeOut,
  introEase,
  openingPosition,
} from "./map-camera.ts";
import { COLUMN_RADIUS, type MapMark } from "./map-view.ts";
import type { PlacedOutline } from "./us-ground.ts";

/** The ring a withheld composite draws: the column's footprint, and no height. */
const RING_INNER_RADIUS = COLUMN_RADIUS * 0.85;
const RING_OUTER_RADIUS = COLUMN_RADIUS * 1.5;

/** Clear of the ground plane, so a ring is not fighting it for the same pixels. */
const RING_LIFT = 0.008;

/** If a custom property does not resolve, the canvas greys rather than guesses. */
const FALLBACK_HUE = "#8a8f98";

export type SkylineInput = {
  marks: readonly MapMark[];
  outlines: readonly PlacedOutline[];
  reducedMotion: boolean;
};

/**
 * Draws the skyline inside `host` and returns the teardown, or null when there
 * is no WebGL context to draw on.
 */
export function mountSkyline(host: HTMLElement, input: SkylineInput): (() => void) | null {
  const renderer = createRenderer();
  if (!renderer) {
    return null;
  }

  const scene = new THREE.Scene();
  // The frame is chosen against the pane's own shape, so a narrow one opens
  // holding the country rather than cutting both coasts off it.
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, hostAspect(host), 0.1, 400);

  const palette = resolvePalette(host);
  scene.add(
    ...lights(),
    groundLines(input.outlines, palette.ground),
    ...markMeshes(input.marks, palette.lamp),
  );

  // A canvas is inline by default, which would leave a text descender's worth
  // of gap under it inside a pane sized to the viewport.
  renderer.domElement.style.display = "block";
  host.appendChild(renderer.domElement);

  const intro = introEase(input.reducedMotion, camera.aspect);
  const from = vector(intro.from);
  const to = vector(intro.to);
  camera.position.copy(from);
  const startedAt = performance.now();

  // The controls read the camera off its position, so it stands where the ease
  // starts before they are built.
  const controls = orbit(camera, renderer.domElement, CONUS_VIEW.target);

  // A pane that changes shape — a phone turned on its side — is re-framed, but
  // only until the visitor takes the controls: after that the view is theirs,
  // and a resize must not throw it away.
  let untouched = true;
  controls.addEventListener("start", () => {
    untouched = false;
  });
  const resize = fitToHost(host, renderer, camera, () => {
    if (!untouched) {
      return;
    }
    to.copy(vector(openingPosition(camera.aspect)));
    // Mid-ease the loop is already driving the camera towards `to`; once it has
    // finished, nothing is, so the new frame is taken here.
    if (performance.now() - startedAt >= intro.durationMs) {
      camera.position.copy(to);
    }
  });

  renderer.setAnimationLoop((now) => {
    // A reduced-motion visitor gets a zero-length ease, so this never runs and
    // the first frame is already the tilted view.
    const elapsed = now - startedAt;
    if (elapsed < intro.durationMs) {
      camera.position.lerpVectors(from, to, easeOut(elapsed / intro.durationMs));
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    resize.disconnect();
    controls.dispose();
    renderer.domElement.remove();
    disposeAll(scene);
    renderer.dispose();
  };
}

/** A camera-module point as three.js wants it. The two agree on world units. */
function vector(point: ScenePoint): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

/**
 * A renderer, or null. A browser with WebGL turned off throws from the context
 * request rather than returning a renderer that draws nothing, so the empty
 * state is chosen here rather than guessed at from a feature list.
 */
function createRenderer(): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    return renderer;
  } catch {
    return null;
  }
}

/** The hue each lamp word lights: one colour per word, and nothing else. */
export type LampColours = Readonly<Record<CandidateLamp, THREE.Color>>;

/**
 * The hues the canvas draws in, resolved once off the stylesheet the ranking
 * table reads: a lamp word's column and its pill light the same custom
 * property, so the two surfaces cannot hold two greens.
 */
type Palette = { ground: THREE.Color; lamp: LampColours };

function resolvePalette(host: HTMLElement): Palette {
  const styles = getComputedStyle(host);
  const colourOf = (variable: string): THREE.Color =>
    new THREE.Color(styles.getPropertyValue(variable).trim() || FALLBACK_HUE);

  return {
    ground: colourOf("--muted-foreground"),
    lamp: Object.fromEntries(
      CANDIDATE_LAMPS.map((lamp) => [lamp, colourOf(lampVariable(lamp))]),
    ) as LampColours,
  };
}

function lights(): THREE.Object3D[] {
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-6, 12, 8);
  return [new THREE.HemisphereLight(0xdfe6f2, 0x0b0c0d, 1.1), key];
}

/**
 * The country: committed state outlines, drawn as lines on the y = 0 plane.
 * Exported so the whole outline can be counted without a canvas — a dropped
 * ring is a state missing from under the columns.
 */
export function groundLines(
  outlines: readonly PlacedOutline[],
  colour: THREE.Color,
): THREE.LineSegments {
  const points: number[] = [];
  for (const outline of outlines) {
    for (const ring of outline.rings) {
      for (let i = 1; i < ring.length; i += 1) {
        points.push(ring[i - 1].x, 0, ring[i - 1].z, ring[i].x, 0, ring[i].z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.45 }),
  );
}

/** The marks that share one geometry and one colour: a shape and a lamp word. */
type MarkGroup = {
  shape: MapMark["shape"];
  lamp: CandidateLamp;
  members: MapMark[];
};

function groupByShapeAndLamp(all: readonly MapMark[]): MarkGroup[] {
  const groups = new Map<string, MarkGroup>();
  for (const mark of all) {
    const key = `${mark.shape}:${mark.lamp}`;
    const group = groups.get(key);
    if (group) {
      group.members.push(mark);
    } else {
      groups.set(key, { shape: mark.shape, lamp: mark.lamp, members: [mark] });
    }
  }
  return [...groups.values()];
}

/**
 * One instanced mesh per lamp word and shape, so a mesh's colour is its lamp
 * and nothing else can set it. A column is a cylinder of the one radius scaled
 * to the mark's own height; a ring is a flat annulus of the same footprint,
 * with no height to scale at all.
 *
 * Exported for the same reason `groundLines` is: three.js builds the instances
 * without a context, so how many there are, how tall and what hue is testable.
 */
export function markMeshes(
  all: readonly MapMark[],
  lampColours: LampColours,
): THREE.InstancedMesh[] {
  return groupByShapeAndLamp(all).map(({ shape, lamp, members }) => {
    const mesh = new THREE.InstancedMesh(
      shapeGeometry(shape),
      new THREE.MeshLambertMaterial({ color: lampColours[lamp], side: THREE.DoubleSide }),
      members.length,
    );

    // A ring keeps its own scale and sits just clear of the ground lines; a
    // column is stretched from its base by the height the mark carries.
    const isRing = shape === "ring";
    const placement = new THREE.Matrix4();
    members.forEach((mark, index) => {
      placement.makeScale(1, isRing ? 1 : mark.height, 1);
      placement.setPosition(mark.x, isRing ? RING_LIFT : 0, mark.z);
      mesh.setMatrixAt(index, placement);
    });
    return mesh;
  });
}

function shapeGeometry(shape: MapMark["shape"]): THREE.BufferGeometry {
  if (shape === "ring") {
    // Flat on the ground plane: a ring lies where a column would stand.
    return new THREE.RingGeometry(RING_INNER_RADIUS, RING_OUTER_RADIUS, 24).rotateX(-Math.PI / 2);
  }
  // A unit-tall cylinder, sat on the ground by its own half-height below.
  return new THREE.CylinderGeometry(COLUMN_RADIUS, COLUMN_RADIUS, 1, 18).translate(0, 0.5, 0);
}

/**
 * Drag orbits and scroll zooms, inside the limits `map-camera.ts` sets. Pan is
 * off: it would carry the target off the ground plane the columns stand on, and
 * an orbit with a fixed up vector is what keeps the country from rolling.
 */
function orbit(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  target: ScenePoint,
): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(vector(target));
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = MIN_POLAR_ANGLE;
  controls.maxPolarAngle = MAX_POLAR_ANGLE;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.update();
  return controls;
}

/** The shape of the pane the canvas is drawn into: its width over its height. */
function hostAspect(host: HTMLElement): number {
  return Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1);
}

/**
 * Keeps the drawing buffer the size of the element it is drawn into, and tells
 * the caller the shape it now has: how far back the country has to be seen from
 * is the aspect ratio's own business.
 */
function fitToHost(
  host: HTMLElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  onFit: () => void,
): ResizeObserver {
  const fit = (): void => {
    // `setSize` writes the CSS size as well as the drawing buffer, so a device
    // pixel ratio above 1 sharpens the canvas rather than doubling its box.
    renderer.setSize(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1));
    camera.aspect = hostAspect(host);
    camera.updateProjectionMatrix();
    onFit();
  };

  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  return observer;
}

/** Every buffer and material this scene made, handed back to the GPU. */
function disposeAll(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
  });
  scene.clear();
}
