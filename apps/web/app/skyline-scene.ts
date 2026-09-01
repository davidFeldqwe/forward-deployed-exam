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
  MAX_POLAR_ANGLE,
  MIN_DISTANCE,
  MIN_POLAR_ANGLE,
  type ScenePoint,
  easeOut,
  farLimit,
  farPlane,
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
export const FALLBACK_HUE = "#8a8f98";

export type SkylineInput = {
  marks: readonly MapMark[];
  outlines: readonly PlacedOutline[];
  reducedMotion: boolean;
};

/**
 * How the canvas is made. The only production caller is `createRenderer`; a
 * test hands in a renderer of its own, because a WebGL context is the one thing
 * in this mount a Node process cannot have. Everything else it does — the ease,
 * the re-frame, deciding whether a frame is worth drawing — is arithmetic.
 */
export type MakeRenderer = () => THREE.WebGLRenderer | null;

/**
 * Draws the skyline inside `host` and returns the teardown, or null when there
 * is no WebGL context to draw on.
 */
export function mountSkyline(
  host: HTMLElement,
  input: SkylineInput,
  makeRenderer: MakeRenderer = createRenderer,
): (() => void) | null {
  const renderer = makeRenderer();
  if (!renderer) {
    return null;
  }

  const scene = new THREE.Scene();
  // The frame is chosen against the pane's own shape, so a narrow one opens
  // holding the country rather than cutting both coasts off it.
  const aspect = hostAspect(host);
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, aspect, 0.1, farPlane(aspect));

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

  // Nothing in this scene moves on its own, so a frame is worth drawing only
  // when something moved it: the opening ease, a drag or a scroll — both of
  // which the controls report as a change — or a resize. The first frame is
  // always one. Left open on a desk the page then costs nothing, rather than a
  // GPU frame every 16 ms for pixels that are already on screen.
  let pending = true;
  controls.addEventListener("change", () => {
    pending = true;
  });

  // A drag, a scroll or a touch — all of which the controls announce as a start
  // — makes the view the visitor's. From then on nothing here writes the camera
  // for them: the opening ease lets go where it stands, and a resize re-frames
  // the pane without moving the camera the visitor put there.
  let untouched = true;
  controls.addEventListener("start", () => {
    untouched = false;
  });
  const resize = fitToHost(host, renderer, camera, () => {
    // A pane of a new shape is a new frustum even where the camera has not
    // moved, so the next frame is drawn whether or not it is re-framed.
    pending = true;
    // How far out the country can be held is the new pane's business, whoever
    // is driving: a visitor who has taken the controls still has to be able to
    // zoom out far enough to see it after turning the phone.
    controls.maxDistance = farLimit(camera.aspect);
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
    // the first frame is already the tilted view. A visitor who reaches for the
    // map while it is still running is not flown on regardless: the ease drops
    // its hold on the camera the moment the view becomes theirs, rather than
    // overwriting their drag on the next frame and snapping to its own frame at
    // the end as though nobody had touched anything.
    const elapsed = now - startedAt;
    if (untouched && elapsed < intro.durationMs) {
      camera.position.lerpVectors(from, to, easeOut(elapsed / intro.durationMs));
    }
    // `update` carries the ease's step, a drag, and the damping still running
    // after one into the camera, and says so through the change event above.
    controls.update();
    if (!pending) {
      return;
    }
    pending = false;
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
 * state is chosen here rather than guessed at from a feature list. How many
 * pixels it draws is `fitToHost`'s: the ratio can change while the page is open.
 */
function createRenderer(): THREE.WebGLRenderer | null {
  try {
    return new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

/**
 * The colour one custom property names. three.js reads hex, comma-separated
 * `rgb()`/`hsl()` and the colour names, and leaves a Color untouched when it
 * cannot read a style at all — so a token written in a space CSS has gained
 * since would make a *fresh* Color white: every column brighter than any lamp
 * word the legend names, with only a console warning to say why. Seeding the
 * fallback grey first is what keeps that promise: an unreadable token, and a
 * property that did not resolve at all, both grey rather than guess.
 *
 * Exported so the tokens the stylesheet declares can be checked against what
 * the canvas can actually read, without a browser to compute them in.
 */
export function hue(value: string): THREE.Color {
  const style = value.trim();
  const grey = new THREE.Color(FALLBACK_HUE);
  return style.length === 0 ? grey : grey.setStyle(style);
}

function resolvePalette(host: HTMLElement): Palette {
  const styles = getComputedStyle(host);
  const colourOf = (variable: string): THREE.Color => hue(styles.getPropertyValue(variable));

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
      // Two vertices per adjacent pair: a ring is drawn as its own segments.
      for (let i = 1; i < ring.length; i += 1) {
        const start = ring[i - 1];
        const end = ring[i];
        points.push(start.x, 0, start.z, end.x, 0, end.z);
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
  controls.maxDistance = farLimit(camera.aspect);
  controls.update();
  return controls;
}

/**
 * The pane the canvas is drawn into, in CSS pixels. Never zero on either side:
 * an aspect ratio has to divide by the height, and a drawing buffer of no width
 * is not a canvas. A pane inside a flex column is briefly both.
 */
function hostSize(host: HTMLElement): { width: number; height: number } {
  return { width: Math.max(host.clientWidth, 1), height: Math.max(host.clientHeight, 1) };
}

/** The shape of that pane: its width over its height. */
function hostAspect(host: HTMLElement): number {
  const { width, height } = hostSize(host);
  return width / height;
}

/**
 * Past two device pixels per CSS pixel the extra ones cost a phone's battery
 * more than they show anyone, so a 3x display is drawn at 2x.
 */
const MAX_PIXEL_RATIO = 2;

/**
 * What one CSS pixel is worth on this display right now. Read on every fit
 * rather than once at the context request: a browser zoom changes the ratio and
 * resizes the pane in the same breath, and a buffer left at the ratio the page
 * opened with draws the outline soft for the rest of the visit.
 */
function pixelRatio(): number {
  return Math.min(globalThis.devicePixelRatio ?? 1, MAX_PIXEL_RATIO);
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
    // One measurement for both, so the drawing buffer and the frustum cannot be
    // told two different shapes by a layout that moved between the reads.
    const { width, height } = hostSize(host);
    // The ratio first: `setSize` multiplies by whatever the renderer is holding.
    renderer.setPixelRatio(pixelRatio());
    // `setSize` writes the CSS size as well as the drawing buffer, so a device
    // pixel ratio above 1 sharpens the canvas rather than doubling its box.
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // The far plane follows the far limit: a pane that has to be seen from
    // further out must be able to see that far.
    camera.far = farPlane(camera.aspect);
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
    // A mark mesh also holds a buffer of its own — one matrix per instance —
    // which nothing but the mesh's own dispose hands back.
    if (object instanceof THREE.InstancedMesh) {
      object.dispose();
    }
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
  });
  scene.clear();
}
