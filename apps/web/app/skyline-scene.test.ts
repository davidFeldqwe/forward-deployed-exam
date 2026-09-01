import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as THREE from "three";

import { CANDIDATE_LAMPS, type CandidateLamp } from "@repo/scoring";

import { lampVariable } from "./lamp-hue.ts";
import { CONUS_VIEW, type ScenePoint, introEase, openingPosition } from "./map-camera.ts";
import {
  INSET_REGIONS,
  type InsetRect,
  MAIN_LAYER,
  insetFrame,
  insetRects,
} from "./map-insets.ts";
import { COLUMN_RADIUS, type MapMark, columnHeight, groundPoint } from "./map-view.ts";
import {
  FALLBACK_HUE,
  type LampColours,
  groundLines,
  hue,
  markMeshes,
  mountSkyline,
} from "./skyline-scene.ts";
import { GROUND_OUTLINES } from "./us-ground.ts";

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

/**
 * The marks a mount is handed: the skyline above, and one airport in each of
 * the two places the atlas frames — Anchorage and Honolulu, at their own
 * coordinates. Nothing in the mount may move them; what the insets do is look
 * at them from somewhere else.
 */
const MOUNTED: readonly MapMark[] = [
  ...SKYLINE,
  located("ANC", "Weak candidate", 20, { latitude: 61.179004, longitude: -149.992561 }),
  located("HNL", "Weak candidate", 28, { latitude: 21.318387, longitude: -157.92567 }),
];

function located(
  iata: string,
  lamp: CandidateLamp,
  composite: number,
  at: { latitude: number; longitude: number },
): MapMark {
  return {
    iata,
    name: iata,
    lamp,
    composite,
    shape: "column",
    height: columnHeight(composite),
    ...groundPoint(at),
  };
}

/** The hue one mesh is drawn in, as a hex string. */
function colourOf(mesh: THREE.InstancedMesh): string {
  return (mesh.material as THREE.MeshLambertMaterial).color.getHexString();
}

/** The one mesh drawing a lamp word, found by the hue only that word lights. */
function meshFor(meshes: readonly THREE.InstancedMesh[], lamp: CandidateLamp): THREE.InstancedMesh {
  const lit = COLOURS[lamp].getHexString();
  const found = meshes.filter((mesh) => colourOf(mesh) === lit);
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

    assert.notEqual(colourOf(mesh), colourOf(meshFor(meshes, "Weak candidate")));
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
  const segments = groundLines(GROUND_OUTLINES, new THREE.Color("#8a8f98"));
  const position = segments.geometry.getAttribute("position");

  // Two vertices per adjacent pair of points: no state and no ring dropped.
  const expected = GROUND_OUTLINES.reduce(
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

/**
 * Whether three.js can read a colour at all. It leaves a Color untouched when
 * it cannot parse the style it is handed, so two Colors seeded apart agree only
 * on a value it actually read.
 */
function readable(value: string): boolean {
  return new THREE.Color(0x000000)
    .setStyle(value)
    .equals(new THREE.Color(0xffffff).setStyle(value));
}

test("a hue the canvas cannot read greys, rather than whitening the column", (t) => {
  // A style three cannot read is warned about, and this test hands it three of
  // them on purpose: the warnings are the fixture, not news about the suite.
  t.mock.method(console, "warn", () => {});

  // three.js speaks hex, comma-separated `rgb()` and `hsl()`, and the colour
  // names — not the spaces CSS has gained since, and not the space-separated
  // `rgb()` this stylesheet already writes its borders in. A value it cannot
  // read leaves a fresh Color white, which on the canvas is a column brighter
  // than every lamp word the legend names.
  for (const value of ["oklch(0.72 0.15 150)", "rgb(76 183 130)", "color(srgb 0.3 0.7 0.5)"]) {
    assert.equal(readable(value), false, `${value} is a syntax the canvas cannot read`);
    assert.equal(hue(value).getHexString(), new THREE.Color(FALLBACK_HUE).getHexString(), value);
  }

  // A property that did not resolve at all arrives empty and greys the same way.
  assert.equal(hue("").getHexString(), new THREE.Color(FALLBACK_HUE).getHexString());
  // What it can read is read: the token's own hue, whitespace and all.
  assert.equal(hue("  #4cb782  ").getHexString(), "4cb782");
});

test("every hue the canvas asks the stylesheet for is one it can read", () => {
  const globals = readFileSync(new URL("globals.css", import.meta.url), "utf8");
  // The ground takes the muted foreground; the five lamp words take their own.
  const wanted = new Set([...CANDIDATE_LAMPS.map(lampVariable), "--muted-foreground"]);

  for (const variable of wanted) {
    const declared = new RegExp(`\\n\\s*${variable}:\\s*([^;]+);`).exec(globals)?.[1];
    assert.ok(declared, `${variable} is declared`);
    // A token the canvas cannot read is not a caught mistake: it is the whole
    // skyline drawn in the fallback grey, with the lamp encoding gone and only
    // a console warning to say so.
    assert.ok(readable(declared.trim()), `${variable}: ${declared.trim()}`);
  }
});

/**
 * The mount itself. A WebGL context is the one thing this module needs that a
 * Node process cannot give it, so the test hands `mountSkyline` a renderer that
 * counts its draws instead: the ease, the re-frame and the redraw decision are
 * arithmetic, and they are what has never been looked at outside a browser.
 */
type FakeRenderer = {
  frame: (now: number) => void;
  /** How many frames something was drawn in; a frame is three viewports now. */
  draws: number;
  /** Every viewport the last drawn frame was made of, in the order drawn. */
  passes: RenderPass[];
  /** The camera the last frame's main viewport was drawn through. */
  camera: THREE.PerspectiveCamera | null;
  /** How many times a WebGL context was asked for: the insets add none. */
  contextsAsked: number;
  scissorTest: boolean;
  size: { width: number; height: number };
  /** What one CSS pixel is worth in the drawing buffer the last fit asked for. */
  pixelRatio: number;
  loopStopped: boolean;
  disposed: boolean;
  /** Whether the GL context itself was handed back, not just three's caches. */
  contextReleased: boolean;
  /** How many listeners were still on the canvas when it was. */
  listenersAtRelease: number;
};

/** One viewport of one frame: where it was drawn, and what through. */
type RenderPass = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** From the drawing buffer's bottom-left corner, the way WebGL reads one. */
  viewport: Box | null;
  /** The same box, as the scissor that keeps a pass off the rest of the pane. */
  scissor: Box | null;
};

type Box = { x: number; y: number; width: number; height: number };

/**
 * A canvas as far as this module and OrbitControls reach into one. Handlers are
 * kept per type rather than one to a type: the mount and the controls both
 * listen for a pointer going down, and a fake that dropped one of them would be
 * testing an arrangement the browser does not have.
 */
function fakeCanvas() {
  const root = { addEventListener() {}, removeEventListener() {} };
  return {
    style: {} as Record<string, string>,
    listeners: new Map<string, Set<(event: unknown) => void>>(),
    addEventListener(type: string, handler: (event: unknown) => void) {
      const handlers = this.listeners.get(type) ?? new Set<(event: unknown) => void>();
      handlers.add(handler);
      this.listeners.set(type, handlers);
    },
    removeEventListener(type: string, handler: (event: unknown) => void) {
      const handlers = this.listeners.get(type);
      handlers?.delete(handler);
      if (handlers?.size === 0) this.listeners.delete(type);
    },
    /** How many handlers are listening at all, of every type. */
    get listenerCount(): number {
      return [...this.listeners.values()].reduce((total, set) => total + set.size, 0);
    },
    /** Everything listening for this event, told in the order it was added. */
    dispatch(type: string, event: unknown): boolean {
      const handlers = this.listeners.get(type);
      for (const handler of [...(handlers ?? [])]) handler(event);
      return handlers !== undefined && handlers.size > 0;
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    getRootNode: () => root,
    ownerDocument: root,
    removed: false,
    remove() {
      this.removed = true;
    },
  };
}

/** A camera-module point as a vector, for measuring the mount's camera by. */
function vector3(point: ScenePoint): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

/** A scroll on the canvas: the zoom the controls report as the visitor's own. */
function scroll(map: MountedSkyline, deltaY: number): void {
  const heard = map.canvas.dispatch("wheel", {
    deltaMode: 0,
    deltaY,
    clientX: 0,
    clientY: 0,
    preventDefault: () => {},
  });
  assert.ok(heard, "the canvas listens for a scroll");
}

/** A pointer event on the canvas, at a point in the pane's own frame. */
function pointerEvent(at: { x: number; y: number }) {
  return {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    offsetX: at.x,
    offsetY: at.y,
    clientX: at.x,
    clientY: at.y,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: () => {},
  };
}

/**
 * A click at a point in the pane: the pointer goes down and comes up in the
 * same place, which is what a browser then reports as a click.
 */
function click(map: MountedSkyline, at: { x: number; y: number }): void {
  map.canvas.dispatch("pointerdown", pointerEvent(at));
  map.canvas.dispatch("click", pointerEvent(at));
}

/** A drag that lets go somewhere else: a browser reports this as a click too. */
function dragTo(
  map: MountedSkyline,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  map.canvas.dispatch("pointerdown", pointerEvent(from));
  map.canvas.dispatch("click", pointerEvent(to));
}

/** The pointer moving over the canvas without any button held. */
function hover(map: MountedSkyline, at: { x: number; y: number }): void {
  map.canvas.dispatch("pointermove", { ...pointerEvent(at), buttons: 0 });
}

/**
 * The GPU handing the canvas its context back, as the browser announces it.
 * three.js calls `preventDefault` on the loss itself, so a restore is a thing
 * that really happens rather than a one-way failure.
 */
function restoreContext(map: MountedSkyline): void {
  const heard = map.canvas.dispatch("webglcontextrestored", {});
  assert.ok(heard, "the canvas listens for its context coming back");
}

/** The display the window is on, as the browser's media queries report it. */
type FakeDisplay = { query: string; watchers: Set<() => void> };

type MountedSkyline = {
  renderer: FakeRenderer;
  canvas: ReturnType<typeof fakeCanvas>;
  /** Re-measures the host, the way a browser's ResizeObserver would. */
  resize: (width: number, height: number) => void;
  /**
   * The window dragged onto a display of another resolution: the pane keeps
   * every CSS pixel it had, so nothing resizes and the media query the buffer
   * was sized against is the only thing that changes.
   */
  moveToDisplay: (ratio: number) => void;
  /** How many listeners the mount has left on the display it is watching. */
  displayWatchers: number;
  observerDisconnected: boolean;
  teardown: () => void;
};

/**
 * Mounts the skyline into a host of the given shape. The globals a canvas host
 * brings — the computed stylesheet, the resize observer and the display's own
 * media queries — are stubbed here for the same reason the renderer is: they
 * are the browser, not the module.
 */
function mountFake(reducedMotion: boolean, width = 1280, height = 720): MountedSkyline {
  const canvas = fakeCanvas();
  let loop: ((now: number) => void) | null = null;
  const renderer: FakeRenderer = {
    draws: 0,
    passes: [],
    camera: null,
    contextsAsked: 0,
    scissorTest: false,
    size: { width: 0, height: 0 },
    pixelRatio: 0,
    loopStopped: false,
    disposed: false,
    contextReleased: false,
    listenersAtRelease: -1,
    // The loop is handed the clock the mount reads its own start from, so a
    // frame at 100 is 100 ms into the page rather than into the process.
    frame: (now) => {
      // A frame is however many viewports the mount draws it in, so the count
      // is of frames that drew something rather than of render calls.
      drawing = [];
      loop?.(mountedAt + now);
      if (drawing.length > 0) {
        renderer.passes = drawing;
        renderer.camera = drawing[0].camera;
        renderer.draws += 1;
      }
    },
  };
  let drawing: RenderPass[] = [];
  let viewport: Box | null = null;
  let scissor: Box | null = null;
  const fake = {
    domElement: canvas,
    setSize: (w: number, h: number) => {
      renderer.size = { width: w, height: h };
    },
    setPixelRatio: (ratio: number) => {
      renderer.pixelRatio = ratio;
    },
    setViewport: (x: number, y: number, width: number, height: number) => {
      viewport = { x, y, width, height };
    },
    setScissor: (x: number, y: number, width: number, height: number) => {
      scissor = { x, y, width, height };
    },
    setScissorTest: (on: boolean) => {
      renderer.scissorTest = on;
    },
    setAnimationLoop: (fn: ((now: number) => void) | null) => {
      loop = fn;
      if (fn === null) renderer.loopStopped = true;
    },
    render: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
      drawing.push({ scene, camera, viewport, scissor });
    },
    dispose: () => {
      renderer.disposed = true;
    },
    forceContextLoss: () => {
      renderer.contextReleased = true;
      renderer.listenersAtRelease = canvas.listenerCount;
    },
  };

  const host = {
    clientWidth: width,
    clientHeight: height,
    appendChild: () => {},
  };
  let observed: (() => void) | null = null;
  const state = { observerDisconnected: false };
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.devicePixelRatio = 1;
  globals.getComputedStyle = () => ({ getPropertyValue: () => "#4cb782" });
  // A query is made for the display the window is on now, so the newest one is
  // the one a move announces itself through.
  let display: FakeDisplay | null = null;
  globals.matchMedia = (query: string) => {
    const watchers = new Set<() => void>();
    display = { query, watchers };
    return {
      media: query,
      matches: true,
      addEventListener: (_type: string, watcher: () => void) => watchers.add(watcher),
      removeEventListener: (_type: string, watcher: () => void) => watchers.delete(watcher),
    };
  };
  globals.ResizeObserver = class {
    constructor(callback: () => void) {
      observed = callback;
    }
    observe() {}
    disconnect() {
      state.observerDisconnected = true;
    }
  };

  const mountedAt = performance.now();
  const teardown = mountSkyline(
    host as unknown as HTMLElement,
    { marks: MOUNTED, outlines: GROUND_OUTLINES, reducedMotion },
    () => {
      renderer.contextsAsked += 1;
      return fake as unknown as THREE.WebGLRenderer;
    },
  );
  assert.ok(teardown, "a renderer is a mount");

  return {
    renderer,
    canvas,
    resize: (w, h) => {
      host.clientWidth = w;
      host.clientHeight = h;
      observed?.();
    },
    moveToDisplay: (ratio) => {
      globals.devicePixelRatio = ratio;
      // The query the buffer was sized against has stopped matching; the ones
      // watching it are told, and they are the only ones told at all.
      for (const watcher of [...(display?.watchers ?? [])]) watcher();
    },
    get displayWatchers() {
      return display?.watchers.size ?? 0;
    },
    get observerDisconnected() {
      return state.observerDisconnected;
    },
    teardown,
  };
}

test("a still skyline is drawn once, not sixty times a second", () => {
  // Reduced motion opens on the finished frame, so nothing is moving at all:
  // every frame after the first would be the same pixels, and a public page
  // left open on a desk must not spend a GPU on redrawing them.
  const map = mountFake(true);

  map.renderer.frame(0);
  const opening = map.renderer.draws;
  for (const now of [16, 32, 48, 64, 1_000, 10_000]) {
    map.renderer.frame(now);
  }

  assert.equal(opening, 1, "the opening frame is drawn");
  assert.equal(map.renderer.draws, 1, "a still canvas is not redrawn");
});

test("the opening ease is drawn while it moves, and stops when it arrives", () => {
  const map = mountFake(false, 1280, 720);
  const aspect = 1280 / 720;
  const ease = introEase(false, aspect);

  map.renderer.frame(0);
  const camera = map.renderer.camera;
  assert.ok(camera);
  // The first frame is the ease's own start: nearly overhead, further out.
  assert.ok(camera.position.distanceTo(vector3(ease.from)) < 1e-3, "opens where the ease starts");

  for (const now of [100, 300, 500, 700, 840]) {
    map.renderer.frame(now);
  }
  const drawnByArrival = map.renderer.draws;
  // Every frame of a moving camera is a frame worth drawing.
  assert.equal(drawnByArrival, 6, "the ease is drawn frame by frame");
  assert.ok(
    camera.position.distanceTo(vector3(openingPosition(aspect))) < 1e-2,
    "the ease arrives at the frame the pane is wide enough for",
  );

  for (const now of [900, 1_600, 5_000]) {
    map.renderer.frame(now);
  }
  assert.equal(map.renderer.draws, drawnByArrival, "an arrived camera is not redrawn");
});

test("a hand on the controls mid-ease keeps the view, and the ease lets go", () => {
  // The opening move is a demo moment, not a ride the visitor is strapped into:
  // an ease that keeps writing the camera's position drops every drag and every
  // scroll made while it runs, and then snaps to its own frame as if nobody had
  // touched anything. A scroll stands in for a drag here because the controls
  // report both the same way — the `start` event this mount listens for.
  const map = mountFake(false, 1280, 720);
  const aspect = 1280 / 720;

  map.renderer.frame(0);
  map.renderer.frame(200);
  const camera = map.renderer.camera;
  assert.ok(camera);
  const midEase = camera.position.clone();

  scroll(map, -240);
  map.renderer.frame(216);
  const taken = camera.position.clone();
  assert.ok(
    taken.distanceTo(vector3(CONUS_VIEW.target)) < midEase.distanceTo(vector3(CONUS_VIEW.target)),
    "the zoom the visitor asked for moved the camera in",
  );

  // The rest of the ease's own duration, and well past it.
  for (let now = 232; now <= 2_000; now += 16) {
    map.renderer.frame(now);
  }

  assert.ok(
    camera.position.distanceTo(taken) < 1e-6,
    `the ease left the view alone: ${camera.position.toArray()} vs ${taken.toArray()}`,
  );
  assert.ok(
    camera.position.distanceTo(vector3(openingPosition(aspect))) > 1,
    "the camera was not flown on to the frame the ease was heading for",
  );
});

test("a scroll is drawn: the gate is a still canvas, not a frozen one", () => {
  const map = mountFake(true);
  map.renderer.frame(0);
  assert.equal(map.renderer.draws, 1);

  scroll(map, -240);
  map.renderer.frame(16);
  assert.ok(map.renderer.draws > 1, "the zoom the visitor asked for is drawn");

  // Damping runs the move on for a few frames, and then the canvas is still.
  for (let now = 32; now < 3_000; now += 16) {
    map.renderer.frame(now);
  }
  const settled = map.renderer.draws;
  for (let now = 3_000; now < 4_000; now += 16) {
    map.renderer.frame(now);
  }
  assert.equal(map.renderer.draws, settled, "the canvas is still again once it settles");
});

test("a context the GPU took away and gave back is drawn again, not left blank", () => {
  // A backgrounded phone tab, a driver reset, another tab asking for too much
  // memory: the browser takes the WebGL context away and hands it back. three
  // re-initialises its own state on the restore but draws nothing, and on a
  // still canvas nothing else would either — no ease is running, no control has
  // changed and the pane is the same shape. Without a frame the visitor is left
  // looking at a blank pane for the rest of the visit, which is the empty state
  // they never got told about.
  const map = mountFake(true);
  map.renderer.frame(0);
  assert.equal(map.renderer.draws, 1);

  restoreContext(map);
  map.renderer.frame(16);
  assert.equal(map.renderer.draws, 2, "the skyline is put back on the new context");

  // And then still again: a restore is one frame, not a licence to redraw.
  for (const now of [32, 48, 1_000]) {
    map.renderer.frame(now);
  }
  assert.equal(map.renderer.draws, 2, "the canvas is still again once it is back");
});

test("a resize re-frames the view nobody has taken, and never one they have", () => {
  const map = mountFake(true, 1280, 720);
  map.renderer.frame(0);

  // A phone turned on its side: the country has to be held from further out.
  map.resize(390, 780);
  const camera = map.renderer.camera;
  assert.ok(camera);
  assert.equal(camera.aspect, 390 / 780);
  // One measurement: the drawing buffer is the pane the frustum was cut for.
  assert.deepEqual(map.renderer.size, { width: 390, height: 780 });
  assert.ok(
    camera.position.distanceTo(vector3(openingPosition(390 / 780))) < 1e-6,
    "an untouched view is re-framed against the new pane",
  );
  map.renderer.frame(16);
  const drawnAfterResize = map.renderer.draws;
  assert.equal(drawnAfterResize, 2, "a new frustum is a frame worth drawing");

  scroll(map, -240);
  map.renderer.frame(32);
  const taken = camera.position.clone();
  map.resize(780, 390);
  assert.deepEqual(camera.position.toArray(), taken.toArray(), "a taken view is left alone");
  // The pane is still the new pane's, whoever is driving: scroll has to reach
  // the frame that would hold the country here.
  assert.equal(camera.aspect, 780 / 390);
});

test("teardown stops the loop, drops the canvas and frees what three holds", () => {
  const map = mountFake(true);
  map.renderer.frame(0);

  map.teardown();

  assert.equal(map.renderer.loopStopped, true, "the animation loop is stopped");
  assert.equal(map.observerDisconnected, true, "the resize observer is disconnected");
  assert.equal(map.canvas.removed, true, "the canvas leaves the page");
  assert.equal(map.renderer.disposed, true, "three's own caches are freed");
  // The controls let the page's own listeners go with them, and the fit lets go
  // of the display it was watching the resolution of.
  assert.equal(map.canvas.listenerCount, 0, "no listener outlives the canvas");
  assert.equal(map.displayWatchers, 0, "no watcher outlives the mount");
});

test("a zoomed browser is drawn at the pixels it now has, not the ones it opened with", () => {
  // A browser zoom changes what a CSS pixel is worth and resizes the pane in the
  // same breath. A ratio read once, when the context was asked for, leaves the
  // drawing buffer short of the screen it is on: the country's outline and every
  // column edge drawn soft for the rest of the visit.
  const display = globalThis as unknown as Record<string, unknown>;
  const map = mountFake(true, 1280, 720);
  assert.equal(map.renderer.pixelRatio, 1, "the canvas opens at the display's own ratio");

  // 150%: fewer CSS pixels in the pane, and each one worth more than it was.
  display.devicePixelRatio = 1.5;
  map.resize(853, 480);
  assert.equal(map.renderer.pixelRatio, 1.5, "the zoom's pixels are the ones drawn");
  assert.deepEqual(map.renderer.size, { width: 853, height: 480 });

  // A phone that reports three device pixels per CSS pixel is capped: past two
  // the extra pixels cost a battery more than anyone can see.
  display.devicePixelRatio = 3;
  map.resize(390, 780);
  assert.equal(map.renderer.pixelRatio, 2);

  map.teardown();
  display.devicePixelRatio = 1;
});

test("a window carried to another display is drawn at the pixels that one has", () => {
  // The demo-night move: the page is opened on a laptop's retina screen and the
  // window is dragged onto the projector beside it. A display of another
  // resolution changes what a CSS pixel is worth without changing how many of
  // them the pane has, so nothing is resized and the buffer keeps the ratio the
  // page opened with — half the pixels the screen has, or twice, for the rest
  // of the visit. The only announcement is the media query's.
  const map = mountFake(true, 1280, 720);
  map.renderer.frame(0);
  assert.equal(map.renderer.pixelRatio, 1);
  assert.deepEqual(map.renderer.size, { width: 1280, height: 720 });

  map.moveToDisplay(2);
  assert.equal(map.renderer.pixelRatio, 2, "the retina screen's pixels are the ones drawn");
  assert.deepEqual(map.renderer.size, { width: 1280, height: 720 }, "the pane is the same pane");
  map.renderer.frame(16);
  assert.equal(map.renderer.draws, 2, "a buffer of a new size is a frame worth drawing");

  // And back again: the watch is re-armed for the display it is on now, rather
  // than spent on the first move.
  map.moveToDisplay(1);
  assert.equal(map.renderer.pixelRatio, 1, "the plain screen's pixels are the ones drawn");

  map.teardown();
});

test("teardown hands the GL context back, so the next visit has one to ask for", () => {
  // `renderer.dispose()` frees three's own caches and drops its listeners; the
  // GL context is a separate thing it keeps, and only `forceContextLoss` gives
  // that back before the detached canvas is collected. A browser allows a
  // handful of live contexts at once (Chrome drops the oldest past sixteen), so
  // a visit that walks chat → map → chat → map holds every abandoned one: the
  // skyline eventually opens on a context the browser refuses, which is the
  // no-WebGL empty state shown to a browser that has WebGL.
  const map = mountFake(true);
  map.renderer.frame(0);

  map.teardown();

  assert.equal(map.renderer.contextReleased, true, "the hardware gets its context back");
  assert.equal(map.renderer.disposed, true, "and three's own caches are freed");
  // The loss is announced on the canvas, so it is given up only once nothing is
  // left listening to it — a teardown must not provoke its own redraw.
  assert.equal(map.renderer.listenersAtRelease, 0, "nothing is listening when it goes");
});

/** The middle of an inset's box, where a pointer would land on the place. */
function centreOf(rect: InsetRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** The boxes the atlas puts the insets in on a pane of this shape. */
function boxes(width: number, height: number): InsetRect[] {
  return insetRects({ width, height });
}

/** Whether the camera is looking at a point, rather than merely standing off it. */
function looksAt(camera: THREE.PerspectiveCamera, at: ScenePoint): boolean {
  const wanted = vector3(at).sub(camera.position).normalize();
  return camera.getWorldDirection(new THREE.Vector3()).distanceTo(wanted) < 1e-3;
}

test("one frame draws the country and both insets, out of one renderer", () => {
  // Three viewports, one WebGL context, one scene: an inset column is the same
  // instance of the same mesh the main view draws, so the two surfaces cannot
  // hold different composites or lamps for the same airport.
  const map = mountFake(true, 1280, 720);
  map.renderer.frame(0);
  const passes = map.renderer.passes;

  assert.equal(map.renderer.contextsAsked, 1, "the insets are not a second canvas");
  assert.equal(passes.length, 1 + INSET_REGIONS.length);
  for (const pass of passes) {
    assert.equal(pass.scene, passes[0].scene, "one scene, drawn three times");
  }
  // Without the scissor a viewport's clear would wipe the whole pane.
  assert.equal(map.renderer.scissorTest, true);

  // The country is the whole pane, drawn through the mount's own camera.
  assert.deepEqual(passes[0].viewport, { x: 0, y: 0, width: 1280, height: 720 });
  assert.deepEqual(passes[0].scissor, passes[0].viewport);

  // The insets are the atlas's own boxes, in the frame WebGL reads a viewport
  // in: its origin is the bottom-left corner, and a box's is the top-left.
  boxes(1280, 720).forEach((rect, index) => {
    const pass = passes[index + 1];
    const expected = {
      x: rect.x,
      y: 720 - rect.y - rect.height,
      width: rect.width,
      height: rect.height,
    };
    assert.deepEqual(pass.viewport, expected, rect.region.key);
    assert.deepEqual(pass.scissor, expected, rect.region.key);
    assert.ok(
      Math.abs(pass.camera.aspect - rect.width / rect.height) < 1e-9,
      `${rect.region.key} is framed against its own box`,
    );
    const frame = insetFrame(rect.region, pass.camera.aspect);
    assert.ok(pass.camera.position.distanceTo(vector3(frame.position)) < 1e-6, rect.region.key);
    assert.ok(looksAt(pass.camera, frame.target), `${rect.region.key} is looked at`);
  });
});

test("an inset draws its own region; the main view draws every one of them", () => {
  const map = mountFake(true);
  map.renderer.frame(0);
  const [main, ...insets] = map.renderer.passes;

  assert.ok(main.camera.layers.isEnabled(MAIN_LAYER), "the country");
  for (const region of INSET_REGIONS) {
    assert.ok(main.camera.layers.isEnabled(region.layer), `and ${region.key}, at true coordinates`);
  }

  insets.forEach((pass, index) => {
    const region = INSET_REGIONS[index];
    assert.ok(pass.camera.layers.isEnabled(region.layer), region.key);
    // A camera standing off Alaska sees the contiguous states between it and
    // the target: an inset that drew them would be a country in a corner box.
    assert.equal(pass.camera.layers.isEnabled(MAIN_LAYER), false, `${region.key} draws no CONUS`);
    for (const other of INSET_REGIONS) {
      if (other.key === region.key) continue;
      const drawn = pass.camera.layers.isEnabled(other.layer);
      assert.equal(drawn, false, `${region.key} draws no ${other.key}`);
    }
  });
});

test("the scene is split between the layers, not thinned or copied", () => {
  const map = mountFake(true);
  map.renderer.frame(0);
  const scene = map.renderer.passes[0].scene;

  const instanced: THREE.InstancedMesh[] = [];
  const lines: THREE.LineSegments[] = [];
  const lights: THREE.Light[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) instanced.push(object);
    else if (object instanceof THREE.LineSegments) lines.push(object);
    else if (object instanceof THREE.Light) lights.push(object);
  });

  const drawnOn = (layer: number) =>
    instanced
      .filter((mesh) => mesh.layers.isEnabled(layer))
      .reduce((total, mesh) => total + mesh.count, 0);

  assert.equal(
    INSET_REGIONS.reduce((total, region) => total + drawnOn(region.layer), drawnOn(MAIN_LAYER)),
    MOUNTED.length,
    "every mark is drawn once, on the layer of the place it stands in",
  );
  assert.equal(drawnOn(MAIN_LAYER), SKYLINE.length, "the contiguous marks");
  for (const region of INSET_REGIONS) {
    assert.equal(drawnOn(region.layer), 1, `${region.key} has its own airport`);
  }

  // The outline is split the same way, and no state is dropped on the way.
  const vertices = lines.reduce(
    (total, line) => total + line.geometry.getAttribute("position").count,
    0,
  );
  const whole = GROUND_OUTLINES.reduce(
    (total, outline) =>
      total + outline.rings.reduce((ring, points) => ring + 2 * (points.length - 1), 0),
    0,
  );
  assert.equal(vertices, whole);

  // A light that lit only the country would leave both insets black.
  assert.ok(lights.length > 0);
  for (const light of lights) {
    for (const region of INSET_REGIONS) {
      assert.ok(light.layers.isEnabled(region.layer), `${light.type} lights ${region.key}`);
    }
  }
});

test("clicking an inset eases the main camera to that region, at full size", () => {
  const map = mountFake(false, 1280, 720);
  map.renderer.frame(0);
  const camera = map.renderer.camera;
  assert.ok(camera);
  const alaska = boxes(1280, 720)[0];
  const frame = insetFrame(alaska.region, camera.aspect);

  click(map, centreOf(alaska));
  map.renderer.frame(16);
  assert.ok(
    camera.position.distanceTo(vector3(frame.position)) > 1,
    "an ease, not a cut: one frame in, the camera is on its way",
  );
  const started = map.renderer.draws;

  for (let now = 32; now <= 1_200; now += 16) {
    map.renderer.frame(now);
  }

  assert.ok(camera.position.distanceTo(vector3(frame.position)) < 1e-2, "it arrives at Alaska");
  assert.ok(looksAt(camera, frame.target), "and is looking at it, not past it");
  assert.ok(map.renderer.draws > started, "the move is drawn frame by frame");

  const settled = map.renderer.draws;
  for (let now = 1_216; now < 2_400; now += 16) {
    map.renderer.frame(now);
  }
  assert.equal(map.renderer.draws, settled, "and the canvas is still again once it is there");
});

test("a visitor who asked for less motion is put there instead of flown", () => {
  const map = mountFake(true, 1280, 720);
  map.renderer.frame(0);
  const camera = map.renderer.camera;
  assert.ok(camera);
  const hawaii = boxes(1280, 720)[1];
  const frame = insetFrame(hawaii.region, camera.aspect);

  click(map, centreOf(hawaii));

  assert.ok(camera.position.distanceTo(vector3(frame.position)) < 1e-6, "already at Hawaii");
  assert.ok(looksAt(camera, frame.target));
  map.renderer.frame(16);
  assert.equal(map.renderer.draws, 2, "and the frame it was snapped to is drawn");
});

test("a drag that lets go over an inset is not a click on it", () => {
  // A browser reports a click wherever a drag ends, so an orbit that finishes
  // over the corner would fly the visitor to Alaska for turning the country.
  const map = mountFake(true, 1280, 720);
  map.renderer.frame(0);
  const camera = map.renderer.camera;
  assert.ok(camera);
  const before = camera.position.clone();
  const alaska = boxes(1280, 720)[0];

  dragTo(map, { x: 900, y: 200 }, centreOf(alaska));
  for (const now of [16, 200, 900]) {
    map.renderer.frame(now);
  }

  assert.deepEqual(camera.position.toArray(), before.toArray(), "the view is where it was");
});

test("the boxes follow the pane, and so does what a click on one means", () => {
  const map = mountFake(true, 1280, 720);
  map.renderer.frame(0);
  const camera = map.renderer.camera;
  assert.ok(camera);

  // A phone turned on its side: the corner the atlas sits in has moved.
  map.resize(390, 780);
  map.renderer.frame(16);
  const rects = boxes(390, 780);
  rects.forEach((rect, index) => {
    assert.deepEqual(map.renderer.passes[index + 1].viewport, {
      x: rect.x,
      y: 780 - rect.y - rect.height,
      width: rect.width,
      height: rect.height,
    });
  });

  // And the hit test is against the boxes as they are now, not as they opened.
  click(map, centreOf(rects[0]));
  const frame = insetFrame(rects[0].region, camera.aspect);
  assert.ok(camera.position.distanceTo(vector3(frame.position)) < 1e-6, "Alaska, on the new pane");
});

test("the pointer over an inset says that it can be clicked", () => {
  const map = mountFake(true, 1280, 720);
  map.renderer.frame(0);
  const alaska = boxes(1280, 720)[0];

  hover(map, centreOf(alaska));
  assert.equal(map.canvas.style.cursor, "pointer");

  hover(map, { x: 640, y: 300 });
  assert.equal(map.canvas.style.cursor, "", "the skyline itself is dragged, not clicked");
});
