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
 * Alaska and Hawaii are atlas insets (issue #72): two more viewports of this
 * one renderer, drawn through cameras of their own onto the same scene, so an
 * inset column is the same instance of the same mesh the main view draws.
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
  REGION_EASE_MS,
  type ScenePoint,
  easeOut,
  farLimit,
  farPlane,
  introEase,
  openingPosition,
} from "./map-camera.ts";
import {
  INSET_REGIONS,
  type InsetKey,
  type InsetRect,
  type InsetRegion,
  MAIN_LAYER,
  type PaneSize,
  insetAt,
  insetFrame,
  insetRects,
  layerAt,
  layerOfState,
} from "./map-insets.ts";
import { COLUMN_RADIUS, type MapMark } from "./map-view.ts";
import type { PlacedOutline } from "./us-ground.ts";

/** The ring a withheld composite draws: the column's footprint, and no height. */
const RING_INNER_RADIUS = COLUMN_RADIUS * 0.85;
const RING_OUTER_RADIUS = COLUMN_RADIUS * 1.5;

/** Clear of the ground plane, so a ring is not fighting it for the same pixels. */
const RING_LIFT = 0.008;

/**
 * If a custom property does not resolve, the canvas greys rather than guesses.
 * The value is `--muted-foreground`'s own: the token cannot be read to find it,
 * so this is the one place the grey is written twice.
 */
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

  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  // The frame is chosen against the pane's own shape, so a narrow one opens
  // holding the country rather than cutting both coasts off it.
  const aspect = hostAspect(host);
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, aspect, 0.1, farPlane(aspect));

  const palette = resolvePalette(host);
  // Every layer, so the main view is one country with Alaska and Hawaii on it
  // at their own coordinates; each inset camera sees only the region it frames.
  camera.layers.enableAll();
  scene.add(...lights(), ...layered(input, palette));

  const atlas = makeAtlas(hostSize(host));

  // A canvas is inline by default, which would leave a text descender's worth
  // of gap under it inside a pane sized to the viewport.
  canvas.style.display = "block";
  host.appendChild(canvas);

  const intro = introEase(input.reducedMotion, camera.aspect);
  const from = vector(intro.from);
  const to = vector(intro.to);
  camera.position.copy(from);
  const startedAt = performance.now();

  // The controls read the camera off its position, so it stands where the ease
  // starts before they are built.
  const controls = orbit(camera, canvas, CONUS_VIEW.target);

  // Nothing in this scene moves on its own, so a frame is worth drawing only
  // when something moved it: the opening ease, a drag or a scroll — both of
  // which the controls report as a change — or a fit. The first frame is always
  // one. Left open on a desk the page then costs nothing, rather than a GPU
  // frame every 16 ms for pixels that are already on screen.
  let pending = true;
  const redraw = (): void => {
    pending = true;
  };
  controls.addEventListener("change", redraw);

  // A browser takes the WebGL context away whenever the GPU needs it back — a
  // backgrounded phone tab, a driver reset, another tab asking for too much —
  // and hands it back after. three.js prevents the loss's default, so the
  // restore really arrives, and re-initialises its own state on it; what it
  // does not do is draw. On a still canvas nothing else would either, so
  // without this the visitor is left looking at a blank pane for the rest of
  // the visit — the empty state, without the sentence explaining it.
  canvas.addEventListener("webglcontextrestored", redraw);

  // A drag, a scroll or a touch — all of which the controls announce as a start
  // — makes the view the visitor's. From then on nothing here writes the camera
  // for them: the opening ease lets go where it stands, and a resize re-frames
  // the pane without moving the camera the visitor put there.
  let untouched = true;
  // The ease onto a region an inset was clicked for, while it is running.
  let flight: RegionEase | null = null;
  controls.addEventListener("start", () => {
    untouched = false;
    // A hand on the controls stops that move too: the view is theirs from here.
    flight = null;
  });

  /**
   * Takes the main camera to a region, at the size the main pane can hold it —
   * the whole point of clicking a corner box. A visitor who asked for less
   * motion is put there instead, which is the same frame without the travel.
   */
  const easeToRegion = (region: InsetRegion): void => {
    const frame = insetFrame(region, camera.aspect);
    const stands = vector(frame.position);
    const looksAt = vector(frame.target);
    // The view is the visitor's from here, the way a drag or a scroll makes it:
    // a resize re-frames the pane after this, never the country.
    untouched = false;
    if (input.reducedMotion) {
      camera.position.copy(stands);
      controls.target.copy(looksAt);
      // Which the controls report as a change, so the frame is drawn.
      controls.update();
      return;
    }
    flight = {
      from: camera.position.clone(),
      to: stands,
      fromTarget: controls.target.clone(),
      toTarget: looksAt,
      startedAt: performance.now(),
    };
  };

  const unwatchInsets = watchInsets(canvas, () => atlas.rects, easeToRegion);

  const unfit = fitToHost(host, renderer, camera, (size) => {
    // A fit is a drawing buffer nothing has been drawn into yet — a pane of a
    // new shape, or the same pane at the resolution of another display — so the
    // next frame is drawn whether or not the camera is re-framed.
    pending = true;
    // The atlas is laid out against the pane it is drawn in, so the boxes stay
    // in the corner of a phone turned on its side — and a click on one means
    // the box it is in now rather than the one the page opened with.
    layOutAtlas(atlas, size);
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
    // The move onto a clicked region carries the target with it: Alaska is not
    // somewhere the orbit can look at from where the country is framed.
    if (flight) {
      const progress = (now - flight.startedAt) / REGION_EASE_MS;
      const eased = easeOut(progress);
      camera.position.lerpVectors(flight.from, flight.to, eased);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
      if (progress >= 1) {
        flight = null;
      }
    }
    // `update` carries the ease's step, a drag, and the damping still running
    // after one into the camera, and says so through the change event above.
    controls.update();
    if (!pending) {
      return;
    }
    pending = false;
    drawViewports(renderer, scene, camera, atlas);
  });

  return () => {
    renderer.setAnimationLoop(null);
    unfit();
    controls.dispose();
    canvas.removeEventListener("webglcontextrestored", redraw);
    unwatchInsets();
    canvas.remove();
    disposeAll(scene);
    renderer.dispose();
    // `dispose` frees three's own caches and listeners; the GL context is a
    // separate thing it holds, and a browser allows only a handful of live ones
    // at a time. Without this, a visit that walks chat → map → chat → map keeps
    // every abandoned context until the detached canvas is collected, and the
    // skyline eventually opens on a context the browser refuses — the empty
    // state, shown to a browser that has WebGL. Last, so the loss it announces
    // on the canvas reaches nothing this mount still has listening.
    renderer.forceContextLoss();
  };
}

/** A camera-module point as three.js wants it. The two agree on world units. */
function vector(point: ScenePoint): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

/** The main camera's move onto a region, while it is running. */
type RegionEase = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  startedAt: number;
};

/**
 * The scene, split by the layer each thing is drawn on. An inset camera sees
 * one layer: standing off Alaska with all of them enabled, it would look at the
 * region straight over the top of the contiguous states and draw them in front
 * of it. Nothing is duplicated by the split — a mark is on the layer of the
 * place it stands in, and the country's outline is split by state, so the main
 * camera, which sees every layer, draws exactly what it drew before.
 */
function layered(input: SkylineInput, palette: Palette): THREE.Object3D[] {
  const layers = [MAIN_LAYER, ...INSET_REGIONS.map((region) => region.layer)];

  return layers.flatMap((layer) => {
    const marks = input.marks.filter((mark) => layerAt(mark) === layer);
    const outlines = input.outlines.filter((outline) => layerOfState(outline.state) === layer);
    const drawn: THREE.Object3D[] = markMeshes(marks, palette.lamp);
    if (outlines.length > 0) {
      drawn.push(groundLines(outlines, palette.ground));
    }
    for (const object of drawn) {
      object.layers.set(layer);
    }
    return drawn;
  });
}

/**
 * The corner viewports as the last layout left them: the pane the boxes are
 * measured in, the boxes themselves, and the camera each one is drawn through.
 * The three travel together because they are one claim from three sides — a box
 * in a pane, and a camera framed against that box.
 */
type Atlas = {
  cameras: Record<InsetKey, THREE.PerspectiveCamera>;
  pane: PaneSize;
  rects: readonly InsetRect[];
};

/** An atlas laid out in a pane of this size: never a camera without a box. */
function makeAtlas(pane: PaneSize): Atlas {
  const cameras = Object.fromEntries(
    INSET_REGIONS.map((region) => {
      // One layer: its own region, and nothing standing between the camera and
      // it. The shape and the far plane are the box's, taken at every layout.
      const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 1);
      camera.layers.set(region.layer);
      return [region.key, camera];
    }),
  ) as Record<InsetKey, THREE.PerspectiveCamera>;

  const atlas: Atlas = { cameras, pane, rects: [] };
  layOutAtlas(atlas, pane);
  return atlas;
}

/** Puts the boxes in a pane of this size, and frames each region in its own. */
function layOutAtlas(atlas: Atlas, pane: PaneSize): void {
  atlas.pane = pane;
  atlas.rects = insetRects(pane);

  for (const rect of atlas.rects) {
    const camera = atlas.cameras[rect.region.key];
    const aspect = rect.width / rect.height;
    const { position, target } = insetFrame(rect.region, aspect);
    camera.aspect = aspect;
    camera.position.copy(vector(position));
    camera.lookAt(target.x, target.y, target.z);
    // Nothing but this region is on the camera's layer, so the far plane has
    // only to reach past the region itself.
    camera.far = camera.position.distanceTo(vector(target)) + rect.region.bounds.radius;
    camera.updateProjectionMatrix();
  }
}

/** How far a pointer may slip between going down and coming up to be a click. */
const CLICK_SLOP = 4;

/** Where a pointer event landed in the pane, which is the box the canvas fills. */
function panedPoint(event: MouseEvent): { x: number; y: number } {
  return { x: event.offsetX, y: event.offsetY };
}

/**
 * Listens for a click on one of the boxes and hands back the region it was in.
 * Returns the teardown.
 *
 * A click is a pointer that went down and came up in the same place: a browser
 * reports one wherever a drag lets go, so an orbit that finished over the
 * corner would otherwise fly the visitor to Alaska for turning the country.
 * The boxes are read when the pointer arrives rather than held, because a
 * resize lays them out again under a pointer that has not moved.
 */
function watchInsets(
  canvas: HTMLCanvasElement,
  boxes: () => readonly InsetRect[],
  onPick: (region: InsetRegion) => void,
): () => void {
  let pressedAt: { x: number; y: number } | null = null;

  const onPointerDown = (event: PointerEvent): void => {
    pressedAt = panedPoint(event);
  };
  const onPointerMove = (event: PointerEvent): void => {
    // The insets are the one thing on this canvas that answers a click.
    canvas.style.cursor = insetAt(boxes(), panedPoint(event)) ? "pointer" : "";
  };
  const onClick = (event: MouseEvent): void => {
    const at = panedPoint(event);
    const down = pressedAt;
    pressedAt = null;
    if (down && Math.hypot(at.x - down.x, at.y - down.y) > CLICK_SLOP) {
      return;
    }
    const hit = insetAt(boxes(), at);
    if (hit) {
      onPick(hit.region);
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("click", onClick);
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("click", onClick);
  };
}

/**
 * One frame: the country over the whole pane, and each inset in its own corner
 * box. The scissor is what keeps a viewport to its box — a render clears before
 * it draws, and an unscissored clear would wipe the country the inset sits on.
 *
 * The boxes are drawn last and so sit over the skyline, which is the corner of
 * the pane an atlas prints them in.
 */
function drawViewports(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  atlas: Atlas,
): void {
  const { cameras, pane, rects } = atlas;

  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, pane.width, pane.height);
  renderer.setScissor(0, 0, pane.width, pane.height);
  renderer.render(scene, camera);

  for (const rect of rects) {
    // A box is measured from the pane's top-left corner and a viewport from the
    // drawing buffer's bottom-left one.
    const bottom = pane.height - rect.y - rect.height;
    renderer.setViewport(rect.x, bottom, rect.width, rect.height);
    renderer.setScissor(rect.x, bottom, rect.width, rect.height);
    renderer.render(scene, cameras[rect.region.key]);
  }
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
  const all = [new THREE.HemisphereLight(0xdfe6f2, 0x0b0c0d, 1.1), key];
  // A light is gathered for a camera that shares a layer with it, so one left
  // on the country's own layer would draw both insets black.
  for (const light of all) {
    light.layers.enableAll();
  }
  return all;
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
  const positions: number[] = [];
  for (const outline of outlines) {
    for (const ring of outline.rings) {
      // Two vertices per adjacent pair: a ring is drawn as its own segments.
      for (let at = 1; at < ring.length; at += 1) {
        const start = ring[at - 1];
        const end = ring[at];
        positions.push(start.x, 0, start.z, end.x, 0, end.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
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
    const groundOffset = isRing ? RING_LIFT : 0;
    const placement = new THREE.Matrix4();
    members.forEach((mark, index) => {
      placement.makeScale(1, isRing ? 1 : mark.height, 1);
      placement.setPosition(mark.x, groundOffset, mark.z);
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
function hostSize(host: HTMLElement): PaneSize {
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
 * What one CSS pixel is worth on this display, as the browser reports it. Read
 * on every fit rather than once at the context request: a browser zoom changes
 * it and resizes the pane in the same breath, and a buffer left at the ratio
 * the page opened with draws the outline soft for the rest of the visit.
 */
function displayRatio(): number {
  return globalThis.devicePixelRatio ?? 1;
}

/** The same ratio, capped: what the drawing buffer is actually sized by. */
function pixelRatio(): number {
  return Math.min(displayRatio(), MAX_PIXEL_RATIO);
}

/**
 * Calls back when a CSS pixel changes what it is worth on this display. A
 * window dragged from a laptop's retina screen onto the projector beside it —
 * or the other way — keeps every CSS pixel the pane had, so nothing is resized
 * and no fit is asked for: the buffer would draw at the ratio the page opened
 * with, soft or wastefully sharp, for the rest of the visit.
 *
 * A media query is what announces it. `(resolution: Ndppx)` matches only on the
 * display it was made for, so the watch is re-made for the display the window
 * is on now each time it stops matching. A browser that cannot read the query
 * never matches and never fires, which is the behaviour there was before rather
 * than a broken one.
 */
function watchPixelRatio(onChange: () => void): () => void {
  let display: MediaQueryList | null = null;
  const moved = (): void => {
    watch();
    onChange();
  };
  const watch = (): void => {
    display?.removeEventListener("change", moved);
    // The display's own ratio, not the capped one: a query naming a resolution
    // this display does not report would never match, and so would never
    // announce the move away from it.
    display = matchMedia(`(resolution: ${displayRatio()}dppx)`);
    display.addEventListener("change", moved);
  };

  watch();
  return () => display?.removeEventListener("change", moved);
}

/**
 * Keeps the drawing buffer the size — and the resolution — of the element it is
 * drawn into, and tells the caller the shape it now has: how far back the
 * country has to be seen from is the aspect ratio's own business. Returns the
 * teardown for both of the things it watches.
 */
function fitToHost(
  host: HTMLElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  onFit: (pane: PaneSize) => void,
): () => void {
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
    // The one measurement again: the viewports are laid out in the pane the
    // drawing buffer was just sized to.
    onFit({ width, height });
  };

  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  const unwatch = watchPixelRatio(fit);
  return () => {
    observer.disconnect();
    unwatch();
  };
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
