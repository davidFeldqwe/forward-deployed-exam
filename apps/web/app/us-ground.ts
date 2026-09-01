/**
 * The ground plane under the `/map` skyline (issue #69 / #68): US state
 * outlines, committed rather than fetched, so the page draws a country with no
 * basemap token and no tile request. The geometry is US Census Bureau
 * cartographic boundaries (public domain), simplified to 0.07° — a country at
 * this camera distance is an outline, not a coastline survey.
 *
 * The outlines are placed with `groundPoint`, the frame the columns stand in,
 * so a column cannot stand off the state it is in.
 */
import { groundPoint } from "./map-view.ts";
import { US_STATES } from "./us-outlines.ts";

/** A ring as the canvas draws it: ground-plane points in the columns' frame. */
export type GroundRing = readonly { x: number; z: number }[];

export type PlacedOutline = {
  state: string;
  rings: readonly GroundRing[];
};

/**
 * Every state outline in the frame the columns stand in. The geometry is
 * committed and the frame is fixed, so the projection is done once here rather
 * than again on every mount.
 */
export const GROUND_OUTLINES: readonly PlacedOutline[] = US_STATES.map(({ state, rings }) => ({
  state,
  rings: rings.map((ring) =>
    ring.map(([longitude, latitude]) => groundPoint({ latitude, longitude })),
  ),
}));
