/**
 * The resolved airport set as a picture (issue #29 / PRD stories 11-25): an
 * inline SVG of the rows this answer ranked, cropped to their own bounding box.
 *
 * The gate is data, never model text. A map is drawn only when all four of
 * these hold, so the picture cannot claim a geography the answer does not have:
 *
 *   (a) *this* message names a US state or one of the nine Census regions, out
 *       of the closed lists below — a follow-up such as "the second one" does
 *       not get a map even while the carried context is still New England;
 *   (b) this turn's `queryAirports` filtered on `region` or `state` — an IATA
 *       compare and a peer-group question are not a place;
 *   (c) two or more of the returned rows carry a coordinate — one pin is not a
 *       set, and an airport the snapshot does not locate is not a pin;
 *   (d) the answer is a ranking rather than a single-metric lookup, which has
 *       no candidate lamp for a marker to light.
 *
 * Marker hue and words come off the same rows the ranking table drew, so a
 * marker and a row cannot disagree; where they seem to, the table is the source
 * of truth. There is no tile library, no projection service and no second
 * geography tool: the points are the snapshot's own latitude and longitude.
 */
import { LOOKUP_METRICS, type CandidateLamp, type ScoredAirport } from "@repo/scoring";
import { CENSUS_DIVISIONS } from "@repo/snapshot";

import {
  rankingRows,
  type JsonObject,
  type JsonValue,
  type ToolCall,
} from "./thread-messages.ts";

/** The drawing box, in SVG user units. The card scales it to its own width. */
export const MAP_WIDTH = 320;
export const MAP_HEIGHT = 200;

/** Breathing room inside the box, so an edge airport is not cut in half. */
export const MAP_PADDING = 18;

export type MapMarker = {
  iata: string;
  name: string;
  /** The row's own lamp: the marker's hue and its word come from one value. */
  lamp: CandidateLamp;
  x: number;
  y: number;
};

export type ResolvedMapView = {
  /** The state or region this message named, spelled as the closed list has it. */
  place: string;
  markers: MapMarker[];
  /** Ranked rows the snapshot does not locate; named rather than dropped. */
  unplaced: string[];
  caption: string;
  viewBox: string;
};

/**
 * The map for one answer's `queryAirports` call, or null when this turn has not
 * earned one. `question` is the user message the answer replies to — the map
 * gate reads that message and no other.
 */
export function resolvedMap(
  question: string | null,
  call: ToolCall | undefined,
): ResolvedMapView | null {
  const rows = rankingRows(call);
  if (!call || !rows) {
    return null;
  }
  const place = placeNamed(question);
  if (place === null || !filtersByStateOrRegion(call.args) || isLookup(call.result)) {
    return null;
  }
  const located = rows.filter(isLocated);
  if (located.length < 2) {
    return null;
  }
  const unplaced = rows.filter((row) => !isLocated(row)).map((row) => row.iata);

  return {
    place,
    markers: project(located),
    unplaced,
    caption: captionOf(place, located.length, unplaced),
    viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
  };
}

/**
 * The nine Census regions and the fifty states and DC, as an analyst spells
 * them. Two-letter codes are deliberately absent: "in", "or", "me" and "ok" are
 * English words before they are states, and a gate whose list cannot be read
 * aloud is a keyword soup. A message naming a state the model then filtered by
 * `region` (or the other way round) still passes: story 19 asks the two halves
 * of the gate to agree that this is geography, not that they name the same row.
 */
const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
] as const;

/** Every place word this gate accepts, longest first so "West Virginia" wins. */
const PLACE_NAMES: readonly string[] = [...CENSUS_DIVISIONS, ...US_STATES].sort(
  (left, right) => right.length - left.length,
);

/**
 * The place this message names, or null. The earliest one in the sentence wins,
 * so "New England, not New York" is a New England question.
 */
function placeNamed(question: string | null): string | null {
  if (question === null) {
    return null;
  }
  let found: { place: string; at: number } | null = null;
  for (const place of PLACE_NAMES) {
    const at = indexOfPhrase(question, place);
    if (at === -1 || (found !== null && at >= found.at)) continue;
    found = { place, at };
  }
  return found?.place ?? null;
}

/** Where a phrase appears as words rather than inside a longer one, or -1. */
function indexOfPhrase(text: string, phrase: string): number {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.search(new RegExp(`(?:^|[^\\p{L}])${escaped}(?:[^\\p{L}]|$)`, "iu"));
}

/**
 * A single-metric lookup, which gets no map even from a state question: a
 * lookup withholds the candidate lamp, and a marker is that lamp as a dot, so
 * the picture would put back the recommendation the table refused to make.
 */
function isLookup(result: JsonValue): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    !Array.isArray(result) &&
    LOOKUP_METRICS.some((metric) => metric === result.metric)
  );
}

/** Half the gate: the tool call this turn made was a geographic one. */
function filtersByStateOrRegion(args: JsonObject): boolean {
  return (["region", "state"] as const).some((field) => {
    const value = args[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

/** A ranked row the snapshot puts somewhere. */
type Located = ScoredAirport & { latitude: number; longitude: number };

/** A coordinate is a pair; half of one is not a point to draw. */
function isLocated(row: ScoredAirport): row is Located {
  return row.latitude !== null && row.longitude !== null;
}

/**
 * The rows placed in the drawing box: an equirectangular projection, then the
 * set's own bounding box scaled to fill the drawing on its longer axis. That
 * crop is the whole map — there is no frame around it to be wrong about, and no
 * coastline the snapshot did not ship.
 */
function project(rows: readonly Located[]): MapMarker[] {
  // Degrees of longitude are shorter than degrees of latitude away from the
  // equator, and this set's own mid-latitude is the honest amount to narrow
  // them by: it is the only latitude the drawing has to be true at.
  const narrowing = Math.cos((extent(rows.map((row) => row.latitude)).middle * Math.PI) / 180);
  // North is up, so latitude runs the other way from the SVG's y axis.
  const points = rows.map((row) => ({ row, x: row.longitude * narrowing, y: -row.latitude }));

  const across = extent(points.map((point) => point.x));
  const down = extent(points.map((point) => point.y));
  // One scale for both axes: a ninety-mile hop reads as a ninety-mile hop, and
  // the shape of New England is not stretched to fill the card.
  const scale = Math.min(
    (MAP_WIDTH - 2 * MAP_PADDING) / across.span,
    (MAP_HEIGHT - 2 * MAP_PADDING) / down.span,
  );

  return points.map(({ row, x, y }) => ({
    iata: row.iata,
    name: row.name,
    lamp: row.candidateLamp,
    x: round((x - across.middle) * scale + MAP_WIDTH / 2),
    y: round((y - down.middle) * scale + MAP_HEIGHT / 2),
  }));
}

/**
 * One axis of the bounding box. The floor keeps two airports on the same
 * meridian from being scaled apart by infinity — a degree of arc is the unit
 * here, so the smallest box the crop will draw is about a degree across.
 */
const MIN_SPAN_DEGREES = 1;

function extent(values: readonly number[]): { middle: number; span: number } {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return { middle: (low + high) / 2, span: Math.max(high - low, MIN_SPAN_DEGREES) };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * What the map is of, under it. It names the rows it could not place rather
 * than quietly drawing fewer pins than the table has rows, and it says which of
 * the two objects to believe.
 */
function captionOf(place: string, placed: number, unplaced: readonly string[]): string {
  return [
    `${placed} of this answer's ranked airports, placed from the snapshot's own coordinates for ${place}.`,
    unplacedNote(unplaced),
    "The ranking table above is the source of truth.",
  ]
    .filter((line) => line !== null)
    .join(" ");
}

function unplacedNote(unplaced: readonly string[]): string | null {
  if (unplaced.length === 0) {
    return null;
  }
  return unplaced.length === 1
    ? `${unplaced[0]} carries no coordinate in the snapshot and is not drawn.`
    : `${unplaced.join(", ")} carry no coordinates in the snapshot and are not drawn.`;
}
