/**
 * Close-zoom IATA labels on `/map` (issue #71 / #68): a short list of the
 * nearest columns in a frustum, faded in only when the camera is close. The
 * opening country view stays a skyline of columns, not four hundred stacked
 * codes. Insets use this same rule against their own camera.
 *
 * Which codes, and how opaque, is decided here so a test can read it without a
 * WebGL context or a camera matrix.
 */
import { COLUMN_RADIUS } from "./map-view.ts";

/** About twenty: enough to scan a close neighbourhood, not the whole universe. */
export const IATA_LABEL_CAP = 20;

/**
 * Camera-to-target distance at which labels are gone. Past this the country is
 * still a field of columns; nearer than this they start to name themselves.
 */
export const LABEL_FADE_OUT = 14;

/** Fully in: close enough that a neighbourhood, not the continent, is in frame. */
export const LABEL_FADE_IN = 6;

/** A mark as the label pass needs it: identity and a point above the ground. */
export type LabelMark = {
  iata: string;
  x: number;
  height: number;
  z: number;
};

export type LabelView = {
  /** Orbit distance, camera to target: zoom, not how near one column is. */
  distance: number;
  camera: { x: number; y: number; z: number };
  inFrustum: (point: { x: number; y: number; z: number }) => boolean;
};

/** Where one IATA sits on the pane, and how far through the fade it is. */
export type PlacedIataLabel = {
  iata: string;
  x: number;
  y: number;
  fade: number;
};

export function labelFade(distance: number): number {
  if (distance >= LABEL_FADE_OUT) return 0;
  if (distance <= LABEL_FADE_IN) return 1;
  return (LABEL_FADE_OUT - distance) / (LABEL_FADE_OUT - LABEL_FADE_IN);
}

/**
 * IATA codes to draw for this view, nearest first, capped, or none when zoomed
 * out. `inFrustum` is the caller's: the scene asks a camera, a test stubs it.
 */
export function iataLabels(
  marks: readonly LabelMark[],
  view: LabelView,
  cap: number = IATA_LABEL_CAP,
): string[] {
  if (labelFade(view.distance) <= 0) {
    return [];
  }

  return marks
    .filter((mark) => view.inFrustum({ x: mark.x, y: mark.height, z: mark.z }))
    .sort((left, right) => distanceTo(view.camera, left) - distanceTo(view.camera, right))
    .slice(0, cap)
    .map((mark) => mark.iata);
}

function distanceTo(camera: LabelView["camera"], mark: LabelMark): number {
  return Math.hypot(mark.x - camera.x, mark.height - camera.y, mark.z - camera.z);
}

/**
 * A label is placed at the top of a column (or on a ring's footprint). Exported
 * so the scene and a test agree which world point is being named.
 */
export function labelPoint(mark: LabelMark): { x: number; y: number; z: number } {
  return { x: mark.x, y: mark.height + COLUMN_RADIUS * 0.25, z: mark.z };
}
