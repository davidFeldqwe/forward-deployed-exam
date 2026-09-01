/**
 * The `/map` skyline as data (issue #69 / #68): what the canvas draws, decided
 * here so it can be read without a WebGL context. `scoreUniverse` is the only
 * source — a mark carries the scored row's own composite and candidate lamp
 * rather than a number the canvas worked out for itself, so a column and a
 * ranking row for the same IATA cannot disagree.
 *
 * Two encodings and no more: height is the composite, linearly, and hue is the
 * lamp (`app/lamp-hue.ts`, the same map the ranking table draws from). Radius
 * is the constant below, so FAA hub size is not smuggled in as a third one.
 * The inspect tooltip (issue #71) copies IATA, lamp, composite, and the score
 * vector off this mark — it does not invent a second card of numbers.
 */
import type { CandidateLamp, ScoredAirport, ScoreVector } from "@repo/scoring";

/** World height of a composite of 100. Every other column is a fraction of it. */
export const MAX_COLUMN_HEIGHT = 3.2;

/** The one width every column is drawn at: constant, on purpose. */
export const COLUMN_RADIUS = 0.32;

/**
 * The frame the columns and the ground plane share: world units per degree of
 * latitude, about the geographic centre of the contiguous states. Longitude is
 * narrowed by the cosine of that latitude so the country is not stretched east
 * to west. Nothing here moves an airport off its own coordinates.
 */
const GROUND_ORIGIN = { latitude: 39.5, longitude: -98.35 } as const;
const UNITS_PER_DEGREE = 0.34;
const LONGITUDE_NARROWING = Math.cos((GROUND_ORIGIN.latitude * Math.PI) / 180);

/** What one airport becomes on the canvas: a column, or a ring on the ground. */
export type MapMark = {
  iata: string;
  name: string;
  lamp: CandidateLamp;
  /** The screen's number, or null where it withheld one. */
  composite: number | null;
  /** The four-number vector the inspect tooltip prints, copied from the row. */
  scoreVector: ScoreVector;
  /**
   * A column for a row with a composite, a flat ring for one without. The two
   * are different shapes rather than a tall column and a short one: a missing
   * component is not a low score, so it must not read as one.
   */
  shape: "column" | "ring";
  /** Linear in the composite; 0 for a ring, which has no height to read. */
  height: number;
  x: number;
  z: number;
};

/** A row the coordinate source located: the snapshot carries the pair together. */
type LocatedAirport = ScoredAirport & { latitude: number; longitude: number };

/**
 * Height for one composite: linear, so 79 stands to 30 as the two numbers do.
 * No rank height and no log — the table's gaps are the skyline's gaps.
 */
export function columnHeight(composite: number): number {
  return (composite / 100) * MAX_COLUMN_HEIGHT;
}

/**
 * Where a coordinate pair sits on the ground plane. Exported because the
 * committed US-states outline is placed with this same function: one frame, so
 * a column cannot stand off the state it is in.
 */
export function groundPoint(at: { latitude: number; longitude: number }): { x: number; z: number } {
  return {
    x: (at.longitude - GROUND_ORIGIN.longitude) * LONGITUDE_NARROWING * UNITS_PER_DEGREE,
    // North is away from a camera that looks down the +z axis.
    z: -(at.latitude - GROUND_ORIGIN.latitude) * UNITS_PER_DEGREE,
  };
}

/**
 * Every scored airport the canvas can place. A row the coordinate source does
 * not locate is left out of the mesh rather than drawn at 0, 0 — it is still a
 * scored row, and chat still ranks it.
 */
export function mapMarks(rows: readonly ScoredAirport[]): MapMark[] {
  return rows.filter(isLocated).map(markOf);
}

function isLocated(row: ScoredAirport): row is LocatedAirport {
  return row.latitude !== null && row.longitude !== null;
}

function markOf(row: LocatedAirport): MapMark {
  const { composite } = row;
  return {
    iata: row.iata,
    name: row.name,
    lamp: row.candidateLamp,
    composite,
    scoreVector: row.scoreVector,
    shape: composite === null ? "ring" : "column",
    height: composite === null ? 0 : columnHeight(composite),
    ...groundPoint(row),
  };
}
