/**
 * Committed US state outlines (Census cartographic boundaries, public domain),
 * parsed rather than cast: a ring of one point is a line across the country.
 * `/map` places these in the skyline's frame; the in-thread map projects the
 * same rings into a ranking's own crop. Neither surface fetches a tile.
 */
import { z } from "zod";

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

export const US_STATES: readonly StateOutline[] = geometrySchema.parse(geometry).states;
