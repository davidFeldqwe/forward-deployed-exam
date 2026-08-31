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

import { lampVariable } from "./lamp-hue.ts";
import {
  CONUS_VIEW,
  MAX_DISTANCE,
  MAX_POLAR_ANGLE,
  MIN_DISTANCE,
  MIN_POLAR_ANGLE,
  easeOut,
  introEase,
} from "./map-camera.ts";
import { COLUMN_RADIUS, type MapMark } from "./map-view.ts";
import type { PlacedOutline } from "./us-ground.ts";

/** The ring a withheld composite draws: the column's footprint, and no height. */
const RING_INNER_RADIUS = COLUMN_RADIUS * 0.85;
const RING_OUTER_RADIUS = COLUMN_RADIUS * 1.5;

/** Clear of the ground plane, so a ring is not fighting it for the same pixels. */
const RING_LIFT = 0.008;

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
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  const { position, target } = CONUS_VIEW;
  camera.position.set(position.x, position.y, position.z);

  const palette = resolvePalette(host);
  scene.add(...lights(), ground(input.outlines, palette.ground), ...columns(input.marks, palette));

  host.appendChild(renderer.domElement);
  const controls = orbit(camera, renderer.domElement, target);
  const resize = fitToHost(host, renderer, camera);

  const intro = introEase(input.reducedMotion);
  const startedAt = performance.now();
  renderer.setAnimationLoop((now) => {
    const elapsed = now - startedAt;
    if (elapsed < intro.durationMs) {
      const eased = easeOut(elapsed / intro.durationMs);
      camera.position.set(
        intro.from.x + (intro.to.x - intro.from.x) * eased,
        intro.from.y + (intro.to.y - intro.from.y) * eased,
        intro.from.z + (intro.to.z - intro.from.z) * eased,
      );
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

/** The hues the canvas draws in, read off the stylesheet the table reads. */
type Palette = { ground: THREE.Color; lamp: (mark: MapMark) => THREE.Color };

function resolvePalette(host: HTMLElement): Palette {
  const styles = getComputedStyle(host);
  const colourOf = (variable: string): THREE.Color =>
    new THREE.Color(styles.getPropertyValue(variable).trim() || "#8a8f98");
  const lamps = new Map<string, THREE.Color>();

  return {
    ground: colourOf("--muted-foreground"),
    lamp: (mark) => {
      const variable = lampVariable(mark.lamp);
      let colour = lamps.get(variable);
      if (!colour) {
        colour = colourOf(variable);
        lamps.set(variable, colour);
      }
      return colour;
    },
  };
}

function lights(): THREE.Object3D[] {
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-6, 12, 8);
  return [new THREE.HemisphereLight(0xdfe6f2, 0x0b0c0d, 1.1), key];
}

/** The country: committed state outlines, drawn as lines on the y = 0 plane. */
function ground(outlines: readonly PlacedOutline[], colour: THREE.Color): THREE.Object3D {
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

/**
 * One instanced mesh per lamp word, so hue is the lamp and nothing else can set
 * it. A column is a cylinder of the one radius, scaled to the mark's height; a
 * ring is a flat annulus of the same footprint, and has no height at all.
 */
function columns(marks: readonly MapMark[], palette: Palette): THREE.Object3D[] {
  const byLamp = new Map<string, MapMark[]>();
  for (const mark of marks) {
    const group = byLamp.get(mark.lamp);
    if (group) group.push(mark);
    else byLamp.set(mark.lamp, [mark]);
  }

  return [...byLamp.values()].map((group) => {
    const drawsRings = group[0].shape === "ring";
    const geometry = drawsRings
      ? new THREE.RingGeometry(RING_INNER_RADIUS, RING_OUTER_RADIUS, 24).rotateX(-Math.PI / 2)
      : // A unit-tall cylinder, sat on the ground by its own half-height below.
        new THREE.CylinderGeometry(COLUMN_RADIUS, COLUMN_RADIUS, 1, 18).translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshLambertMaterial({ color: palette.lamp(group[0]), side: THREE.DoubleSide }),
      group.length,
    );

    const placement = new THREE.Matrix4();
    group.forEach((mark, index) => {
      placement.makeScale(1, drawsRings ? 1 : mark.height, 1);
      placement.setPosition(mark.x, drawsRings ? RING_LIFT : 0, mark.z);
      mesh.setMatrixAt(index, placement);
    });
    return mesh;
  });
}

/**
 * Drag orbits and scroll zooms, inside the limits `map-camera.ts` sets. Pan is
 * off: it would carry the target off the ground plane the columns stand on, and
 * an orbit with a fixed up vector is what keeps the country from rolling.
 */
function orbit(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  target: { x: number; y: number; z: number },
): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(target.x, target.y, target.z);
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

/** Keeps the drawing buffer the size of the element it is drawn into. */
function fitToHost(
  host: HTMLElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
): ResizeObserver {
  const fit = (): void => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
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
