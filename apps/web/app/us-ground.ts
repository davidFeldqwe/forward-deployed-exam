/**
 * The ground plane under the `/map` skyline (issue #69 / #68): US state
 * outlines, committed rather than fetched, so the page draws a country with no
 * basemap token and no tile request. The geometry is US Census Bureau
 * cartographic boundaries (public domain), simplified to 0.07° — a country at
 * this camera distance is an outline, not a coastline survey.
 *
 * The file is parsed rather than cast, for the reason the snapshot is: a
 * committed JSON is still data the module did not compute, and a ring of one
 * point is a line across the country rather than a state.
 *
 * The outlines are placed with `groundPoint`, the frame the columns stand in,
 * so a column cannot stand off the state it is in.
 */
import { z } from "zod";

import { groundPoint } from "./map-view.ts";
import geometry from "./us-states.json" with { type: "json" };

/** `[longitude, latitude]`, the order GeoJSON writes a position in. */
const degreePointSchema = z.tuple([z.number(), z.number()]);

const outlineSchema = z.strictObject({
  /** The two-letter postal code, the same key the snapshot files an airport by. */
  state: z.string().regex(/^[A-Z]{2}$/),
  // A closed ring needs a first point, two more, and the first one again.
  rings: z.array(z.array(degreePointSchema).min(4)).min(1),
});

const geometrySchema = z.strictObject({
  source: z.string().min(1),
  states: z.array(outlineSchema).min(1),
});

export type StateOutline = z.infer<typeof outlineSchema>;

/** A ring as the canvas draws it: ground-plane points in the columns' frame. */
export type GroundRing = readonly { x: number; z: number }[];

export type PlacedOutline = {
  state: string;
  rings: readonly GroundRing[];
};

export const US_STATES: readonly StateOutline[] = geometrySchema.parse(geometry).states;

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
