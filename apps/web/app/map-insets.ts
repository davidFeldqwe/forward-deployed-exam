/**
 * The atlas insets on `/map` (issue #72 / #68): Alaska and Hawaii, framed in
 * corner viewports of the one renderer the country is drawn in. Nothing here
 * moves an airport — the marks keep the true coordinates `map-view.ts` placed
 * them at, and an inset is a second camera onto the same scene, so a column in
 * a corner box is the same scored row as the column the main view would show
 * if it could reach that far.
 *
 * Three things are decided here, all of them arithmetic over the committed
 * geometry: which places have an inset, where their boxes sit in the pane, and
 * the frame a click on one eases the main camera to.
 *
 * Puerto Rico, the Virgin Islands, Guam and American Samoa are deliberately not
 * here. They stay in the snapshot at true coordinates and may sit outside the
 * opening frustum; the atlas is the contiguous states plus these two.
 */
import { type ScenePoint, framedPosition } from "./map-camera.ts";
import { MAX_COLUMN_HEIGHT } from "./map-view.ts";
import { GROUND_OUTLINES } from "./us-ground.ts";

/**
 * The layer the country is drawn on. An inset draws its own region and nothing
 * else: a camera standing off Alaska with every layer enabled would look at it
 * straight over the top of the contiguous states, and draw them in front of it.
 * The main camera enables all of them, so the main view is still one country.
 */
export const MAIN_LAYER = 0;

export type InsetKey = "alaska" | "hawaii";

/** Where a region sits on the ground plane, and how big a sphere holds it. */
export type RegionBounds = {
  centre: { x: number; z: number };
  halfWidth: number;
  halfDepth: number;
  /** A sphere at `centre` holding the region and a column of the full height. */
  radius: number;
};

export type InsetRegion = {
  key: InsetKey;
  /** The place, in the words the legend uses. */
  label: string;
  /** The postal codes whose outlines and airports the inset draws. */
  states: readonly string[];
  /** The layer that geometry is drawn on: one inset, one layer of its own. */
  layer: number;
  bounds: RegionBounds;
};

/** The two places the contiguous frame cannot hold, in atlas order. */
const ATLAS: readonly { key: InsetKey; label: string; states: readonly string[] }[] = [
  { key: "alaska", label: "Alaska", states: ["AK"] },
  { key: "hawaii", label: "Hawaii", states: ["HI"] },
];

/**
 * A region's reach, measured off the committed outline rather than written
 * down: a geometry file that gains a simplified island moves the frame with it.
 */
function boundsOf(states: readonly string[]): RegionBounds {
  const points = GROUND_OUTLINES.filter((outline) => states.includes(outline.state)).flatMap(
    (outline) => outline.rings.flat(),
  );
  if (points.length === 0) {
    throw new Error(`no committed outline for ${states.join(", ")}`);
  }

  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const west = Math.min(...xs);
  const east = Math.max(...xs);
  const north = Math.min(...zs);
  const south = Math.max(...zs);
  const halfWidth = (east - west) / 2;
  const halfDepth = (south - north) / 2;

  return {
    centre: { x: (east + west) / 2, z: (south + north) / 2 },
    halfWidth,
    halfDepth,
    // The furthest thing from the centre is the top of a full-height column
    // standing in a corner of the box, so the sphere holds all three reaches.
    radius: Math.hypot(halfWidth, halfDepth, MAX_COLUMN_HEIGHT),
  };
}

export const INSET_REGIONS: readonly InsetRegion[] = ATLAS.map((region, index) => ({
  ...region,
  // The country has layer 0, so the first inset is 1: a layer is never shared.
  layer: MAIN_LAYER + 1 + index,
  bounds: boundsOf(region.states),
}));

/** Whether a ground-plane point is inside a region's own box. */
function holds(bounds: RegionBounds, point: { x: number; z: number }): boolean {
  return (
    Math.abs(point.x - bounds.centre.x) <= bounds.halfWidth &&
    Math.abs(point.z - bounds.centre.z) <= bounds.halfDepth
  );
}

/**
 * The inset a point on the ground plane belongs to, or null for the country.
 * A mark carries no state code, and it does not need one: an inset draws what
 * stands inside the box it frames.
 */
function regionAt(point: { x: number; z: number }): InsetRegion | null {
  return INSET_REGIONS.find((region) => holds(region.bounds, point)) ?? null;
}

/** The layer a mark at this point is drawn on. */
export function layerAt(point: { x: number; z: number }): number {
  return regionAt(point)?.layer ?? MAIN_LAYER;
}

/** The layer a state's committed outline is drawn on. */
export function layerOfState(state: string): number {
  return INSET_REGIONS.find((region) => region.states.includes(state))?.layer ?? MAIN_LAYER;
}

/** How much of the pane's height one inset box takes, and its own limits. */
const INSET_HEIGHT_SHARE = 0.26;
const MIN_INSET_HEIGHT = 64;
const MAX_INSET_HEIGHT = 190;
/** And no more than this much of a short pane, whatever the share works out at. */
const MAX_INSET_HEIGHT_SHARE = 0.4;

/** How much of the pane's width both boxes may take: a corner, not a half. */
const MAX_ATLAS_WIDTH_SHARE = 0.46;

/** The gap to the pane's edges, and the one between the two boxes, in CSS px. */
const INSET_MARGIN = 14;
const INSET_GAP = 10;

/**
 * How wide a box may be for its height. Alaska's own outline is wider than
 * this, and a box cut to it would be a letterbox with two columns in it.
 */
const MIN_BOX_ASPECT = 0.9;
const MAX_BOX_ASPECT = 1.7;

/** One inset's box, in CSS pixels from the pane's top-left — a pointer's frame. */
export type InsetRect = {
  region: InsetRegion;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PaneSize = { width: number; height: number };

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** A box shaped like the region in it, within the limits above. */
function boxAspect(region: InsetRegion): number {
  const { halfWidth, halfDepth } = region.bounds;
  return clamp(halfWidth / halfDepth, MIN_BOX_ASPECT, MAX_BOX_ASPECT);
}

/**
 * Where the two boxes sit on a pane of this size: the bottom-left corner, side
 * by side, in the order an atlas prints them. Both are scaled together when the
 * pane is too narrow to hold them at their own size, so the pair keeps its
 * shape rather than one of them being squeezed.
 */
export function insetRects(pane: PaneSize): InsetRect[] {
  const tallest = Math.min(MAX_INSET_HEIGHT, pane.height * MAX_INSET_HEIGHT_SHARE);
  const height = clamp(pane.height * INSET_HEIGHT_SHARE, MIN_INSET_HEIGHT, tallest);
  const widths = INSET_REGIONS.map((region) => height * boxAspect(region));

  const gaps = INSET_GAP * (INSET_REGIONS.length - 1);
  // The boxes fit inside their share of the pane, and inside the pane itself
  // once the margins and the gap between them are taken out of it.
  const room = Math.max(
    Math.min(pane.width * MAX_ATLAS_WIDTH_SHARE, pane.width - INSET_MARGIN * 2 - gaps),
    1,
  );
  const scale = Math.min(1, room / widths.reduce((total, width) => total + width, 0));

  const boxHeight = Math.max(height * scale, 1);
  // Both boxes are the same height, so both sit on the one line above the
  // pane's bottom margin; only the left edge moves along.
  const y = Math.max(pane.height - INSET_MARGIN - boxHeight, 0);

  let x = INSET_MARGIN;
  return INSET_REGIONS.map((region, index) => {
    const width = Math.max(widths[index] * scale, 1);
    const rect = { region, x, y, width, height: boxHeight };
    x += width + INSET_GAP;
    return rect;
  });
}

/** The inset a pointer at this point in the pane is over, or null. */
export function insetAt(
  rects: readonly InsetRect[],
  point: { x: number; y: number },
): InsetRect | null {
  return (
    rects.find(
      (rect) =>
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height,
    ) ?? null
  );
}

/**
 * How a region is framed on a viewport of this shape: looking at its centre on
 * the ground plane, from the tilt the country itself is seen from and far
 * enough back to hold all of it.
 *
 * The inset viewport is drawn through this frame, and a click on that inset
 * eases the main camera to the same one at the main pane's shape — so the view
 * a visitor is taken to is the view they clicked, at full size.
 */
export function insetFrame(
  region: InsetRegion,
  aspect: number,
): { position: ScenePoint; target: ScenePoint } {
  const target = { x: region.bounds.centre.x, y: 0, z: region.bounds.centre.z };
  return { position: framedPosition(target, region.bounds.radius, aspect), target };
}
