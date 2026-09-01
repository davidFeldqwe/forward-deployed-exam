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

/**
 * A point in the scene's world units; the ground plane is y = 0. Read-only,
 * because these points are shared rather than copied — a reduced-motion ease
 * hands back the same point as both its start and its finish, and the scene
 * copies them into its own vectors before moving anything.
 */
export type ScenePoint = { readonly x: number; readonly y: number; readonly z: number };

/**
 * The frame the map opens in on a wide pane: a tilt over the contiguous states,
 * from the south and above. A narrower pane opens further back along this same
 * ray — see `openingPosition`.
 */
export const CONUS_VIEW: Readonly<{ position: ScenePoint; target: ScenePoint }> = {
  position: { x: 0, y: 11, z: 17 },
  target: { x: 0, y: 0, z: 1 },
};

/**
 * The vertical field of view the scene builds its camera with, in degrees. It
 * lives here because the opening distance is worked out from it: a frustum
 * angle changed in the scene alone would frame a different country.
 */
export const FIELD_OF_VIEW = 45;

/** Half of it, in radians: the frustum's own half-angle above its axis. */
const HALF_FOV = (FIELD_OF_VIEW * Math.PI) / 360;

/**
 * Half the contiguous states' east–west reach, in the world units `groundPoint`
 * places them in. The frame is centred on x = 0 and the country is not centred
 * on it — the eastern edge is the further of the two — so this is the eastern
 * one. A test pins it to the committed outline.
 *
 * Alaska, Hawaii and Puerto Rico are outside this: framing them would shrink
 * the contiguous states to nothing. All three are drawn where they are, and an
 * orbit reaches them; Alaska and Hawaii are also held in the atlas insets
 * (`app/map-insets.ts`), which is what a visitor reaches them by.
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

/**
 * How close scroll may take the camera to the target, and how far — on a pane
 * that holds the country from nearer than this. A narrower pane has to open
 * further out than it, so the far limit itself is `farLimit(aspect)`: a fixed
 * ceiling would clamp the opening frame away on the pane that needed it most.
 */
export const MIN_DISTANCE = 3;
export const MAX_DISTANCE = 46;

/**
 * How far the drawn world reaches past the orbit's target, in world units.
 * Pacific primaries (Guam, the Marianas, American Samoa) sit at true
 * coordinates well past the Aleutians; the camera's far plane is this beyond
 * wherever the orbit may stand, so those columns are never clipped by it. A
 * test pins it to the committed snapshot.
 */
export const WORLD_REACH = 65;

/** The first-load ease, in milliseconds: a demo moment, not a fly-through. */
const INTRO_MS = 850;

/**
 * The direction the ease starts from: nearly overhead, looking down on the
 * country rather than along it, so the move is a tilt into the frame. Only the
 * heading is read — the distance is the opening frame's own, pulled back a
 * little — so the start is inside `farLimit`'s own limits at every aspect and
 * the controls never clamp the first frame out from under the move.
 */
const INTRO_HEADING: ScenePoint = { x: 0, y: 26, z: 6 };

/**
 * How much further out the ease starts than it ends: a step back, not a flight.
 * The zoom's far limit is this much past the opening frame too, so the step is
 * the same one on every pane rather than a crawl on a narrow one.
 */
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
 * pane is not pulled in on top of the skyline — and not capped, because the
 * zoom's far limit is worked out from this rather than the other way round.
 */
function openingDistance(aspect: number): number {
  const halfHeightPerUnit = Math.tan(HALF_FOV);
  const needed = CONUS_HALF_WIDTH / (halfHeightPerUnit * aspect * FRAME_FILL);
  return Math.max(needed, BASE_DISTANCE);
}

/**
 * How far out the opening move starts on a pane of this shape: the opening
 * frame, stepped back. `farLimit` is never nearer than this and the ease starts
 * exactly here, so the two cannot drift into a step the controls clamp away.
 */
function steppedBackDistance(aspect: number): number {
  return openingDistance(aspect) * INTRO_PULL_BACK;
}

/**
 * How far scroll may take the camera out on a pane of this shape. Never nearer
 * than where the map opens and steps back from — a limit that stopped short of
 * the opening frame would be clamping the country's own coasts off a narrow
 * pane, and holding the intro ease still while it did it.
 */
export function farLimit(aspect: number): number {
  return Math.max(MAX_DISTANCE, steppedBackDistance(aspect));
}

/**
 * How far the camera can see on a pane of this shape: past the furthest the
 * orbit may stand, and past the world's own reach behind the target. A fixed
 * far plane would clip the country out of the frame it was moved back to hold.
 */
export function farPlane(aspect: number): number {
  return farLimit(aspect) + WORLD_REACH;
}

/**
 * How far back a camera has to stand for a sphere of this radius, centred on
 * what it is looking at, to sit inside the frustum of a pane this shape. The
 * narrower of the two half-angles is the one that has to hold it: a portrait
 * pane is cut by its width, a landscape one by its height.
 *
 * This is the atlas insets' framing (`app/map-insets.ts`) and the frame a click
 * on one eases the main camera to, so a region is framed by the same arithmetic
 * whichever viewport it is drawn in.
 */
function framedDistance(radius: number, aspect: number): number {
  const halfWidth = Math.atan(Math.tan(HALF_FOV) * aspect);
  return radius / (Math.sin(Math.min(HALF_FOV, halfWidth)) * FRAME_FILL);
}

/** The direction the country is seen from: `CONUS_VIEW`'s own, as a unit ray. */
const TILT: ScenePoint = {
  x: (CONUS_VIEW.position.x - CONUS_VIEW.target.x) / BASE_DISTANCE,
  y: (CONUS_VIEW.position.y - CONUS_VIEW.target.y) / BASE_DISTANCE,
  z: (CONUS_VIEW.position.z - CONUS_VIEW.target.z) / BASE_DISTANCE,
};

/**
 * Where a camera framing that sphere stands: back along the tilt the country is
 * seen from, so an inset is the same view of a smaller place rather than a plan
 * view in which every column is a coloured dot.
 */
export function framedPosition(target: ScenePoint, radius: number, aspect: number): ScenePoint {
  const distance = framedDistance(radius, aspect);
  return {
    x: target.x + TILT.x * distance,
    y: target.y + TILT.y * distance,
    z: target.z + TILT.z * distance,
  };
}

/**
 * How long the main camera takes to reach the region an inset was clicked for:
 * a move the eye can follow from one frame to the other, not a tour. A visitor
 * who asked for less motion is put there instead — see `mountSkyline`.
 */
export const REGION_EASE_MS = 700;

/**
 * Where the camera opens on a pane of this shape: the `CONUS_VIEW` tilt, moved
 * along its own ray until the country fits. The angle never changes with the
 * viewport — a phone and a laptop look at the country the same way, from
 * further off.
 */
export function openingPosition(aspect: number): ScenePoint {
  // A pane already wide enough for the country is left at `CONUS_VIEW` itself:
  // moving that point to the distance it already stands at leaves it there.
  return atDistance(CONUS_VIEW.position, openingDistance(aspect));
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

  return {
    from: atDistance(INTRO_HEADING, steppedBackDistance(aspect)),
    to,
    durationMs: INTRO_MS,
  };
}

/**
 * The ease's shape over 0..1: fast at the start, arriving rather than stopping.
 * Cubic, the same curve family the stylesheet's `--ease-out` names.
 */
export function easeOut(progress: number): number {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return 1 - (1 - clamped) ** 3;
}
