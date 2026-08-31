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
 * The frame the map opens in: a tilt over the contiguous states, from the south
 * and above, far enough back that the whole country is in the frustum.
 */
export const CONUS_VIEW: { position: ScenePoint; target: ScenePoint } = {
  position: { x: 0, y: 11, z: 17 },
  target: { x: 0, y: 0, z: 1 },
};

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
 * Where that ease starts: higher up and further out, looking down on the
 * country rather than along it. Inside the orbit's own limits, so the controls
 * do not clamp the first frame out from under the move.
 */
const INTRO_FROM: ScenePoint = { x: 0, y: 26, z: 6 };

export type IntroEase = {
  from: ScenePoint;
  to: ScenePoint;
  durationMs: number;
};

/**
 * The opening move. A visitor who asked for less motion is put in the finished
 * frame instead: the tilted view is the point, and the flight into it is not.
 */
export function introEase(reducedMotion: boolean): IntroEase {
  return {
    from: reducedMotion ? CONUS_VIEW.position : INTRO_FROM,
    to: CONUS_VIEW.position,
    durationMs: reducedMotion ? 0 : INTRO_MS,
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
