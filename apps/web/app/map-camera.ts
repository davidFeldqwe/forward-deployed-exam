/**
 * How the `/map` camera may move (issue #69 / #68). The rules are here rather
 * than inside the WebGL scene so they can be read and tested without a canvas:
 * where the view opens, how far it may zoom, and the two angles that keep the
 * orbit above the ground.
 *
 * There is no roll to constrain — an orbit keeps the world's up vector, so the
 * country never tips — and no pan, so the target stays on the ground plane the
 * columns stand on.
 */

/** A point in the scene's world units; the ground plane is y = 0. */
export type ScenePoint = { x: number; y: number; z: number };

/**
 * The frame the map opens in on a wide pane: a tilt over the contiguous states,
 * from the south and above. A narrower pane opens further back along this same
 * ray — see `openingPosition`.
 */
export const CONUS_VIEW: { position: ScenePoint; target: ScenePoint } = {
  position: { x: 0, y: 11, z: 17 },
  target: { x: 0, y: 0, z: 1 },
};

/**
 * The vertical field of view the scene builds its camera with, in degrees. It
 * lives here because the opening distance is worked out from it: a frustum
 * angle changed in the scene alone would frame a different country.
 */
export const FIELD_OF_VIEW = 45;

/**
 * Half the contiguous states' east–west reach, in the world units `groundPoint`
 * places them in. The frame is centred on x = 0 and the country is not centred
 * on it — the eastern edge is the further of the two — so this is the eastern
 * one. A test pins it to the committed outline.
 *
 * Alaska, Hawaii and Puerto Rico are outside this: framing them would shrink
 * the contiguous states to nothing, and the inset viewports that carry them are
 * #68's follow-on. They are drawn, and an orbit reaches them.
 */
export const CONUS_HALF_WIDTH = 8.3;

/** How much of the frame's width the country is allowed to take, edge to edge. */
const FRAME_FILL = 0.9;

/**
 * Polar angle is measured from straight up, so half pi is level with the ground
 * and anything past it is under the country. The camera stops short of both
 * ends: it can neither pass under the ground plane nor stand exactly on the
 * pole, where an orbit has no heading left to turn.
 */
export const MIN_POLAR_ANGLE = 0.12;
export const MAX_POLAR_ANGLE = Math.PI / 2 - 0.06;

/** How close and how far scroll may take the camera from the target. */
export const MIN_DISTANCE = 3;
export const MAX_DISTANCE = 46;

/** The first-load ease, in milliseconds: a demo moment, not a fly-through. */
const INTRO_MS = 850;

/**
 * The direction the ease starts from: nearly overhead, looking down on the
 * country rather than along it, so the move is a tilt into the frame. Only the
 * heading is read — the distance is the opening frame's own, pulled back a
 * little — so the start is inside the orbit's limits at every aspect and the
 * controls never clamp the first frame out from under the move.
 */
const INTRO_HEADING: ScenePoint = { x: 0, y: 26, z: 6 };

/** How much further out the ease starts than it ends: a step back, not a flight. */
const INTRO_PULL_BACK = 1.2;

/** How far the camera stands from the target in `CONUS_VIEW`. */
const BASE_DISTANCE = distanceFromTarget(CONUS_VIEW.position);

function distanceFromTarget(point: ScenePoint): number {
  return Math.hypot(
    point.x - CONUS_VIEW.target.x,
    point.y - CONUS_VIEW.target.y,
    point.z - CONUS_VIEW.target.z,
  );
}

/** The point `distance` from the target along the ray `heading` points down. */
function atDistance(heading: ScenePoint, distance: number): ScenePoint {
  const reach = distance / distanceFromTarget(heading);
  return {
    x: CONUS_VIEW.target.x + (heading.x - CONUS_VIEW.target.x) * reach,
    y: CONUS_VIEW.target.y + (heading.y - CONUS_VIEW.target.y) * reach,
    z: CONUS_VIEW.target.z + (heading.z - CONUS_VIEW.target.z) * reach,
  };
}

/**
 * How far back the camera has to stand for the whole contiguous country to be
 * in the frustum of a pane this shape. Half the frustum's width is the aspect
 * ratio times half its height, so a portrait pane that kept the wide pane's
 * distance would cut both coasts off. Never nearer than `CONUS_VIEW` — a wide
 * pane is not pulled in on top of the skyline — and never past the zoom's own
 * far limit, which is the furthest the orbit could hold anyway.
 */
function openingDistance(aspect: number): number {
  const halfHeightPerUnit = Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
  const needed = CONUS_HALF_WIDTH / (halfHeightPerUnit * aspect * FRAME_FILL);
  return Math.min(Math.max(needed, BASE_DISTANCE), MAX_DISTANCE);
}

/**
 * Where the camera opens on a pane of this shape: the `CONUS_VIEW` tilt, moved
 * along its own ray until the country fits. The angle never changes with the
 * viewport — a phone and a laptop look at the country the same way, from
 * further off.
 */
export function openingPosition(aspect: number): ScenePoint {
  const distance = openingDistance(aspect);
  return distance === BASE_DISTANCE
    ? CONUS_VIEW.position
    : atDistance(CONUS_VIEW.position, distance);
}

export type IntroEase = {
  from: ScenePoint;
  to: ScenePoint;
  durationMs: number;
};

/**
 * The opening move, into the frame this pane is wide enough for. A visitor who
 * asked for less motion is put in the finished frame instead: the tilted view
 * is the point, and the flight into it is not.
 */
export function introEase(reducedMotion: boolean, aspect: number): IntroEase {
  const to = openingPosition(aspect);
  if (reducedMotion) {
    return { from: to, to, durationMs: 0 };
  }

  const distance = Math.min(openingDistance(aspect) * INTRO_PULL_BACK, MAX_DISTANCE);
  return { from: atDistance(INTRO_HEADING, distance), to, durationMs: INTRO_MS };
}

/**
 * The ease's shape over 0..1: fast at the start, arriving rather than stopping.
 * Cubic, the same curve family the stylesheet's `--ease-out` names.
 */
export function easeOut(progress: number): number {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return 1 - (1 - clamped) ** 3;
}
