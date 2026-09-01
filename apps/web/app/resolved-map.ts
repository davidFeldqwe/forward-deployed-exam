/**
 * The resolved airport set as a picture (issue #29 / PRD stories 11-25): an
 * inline SVG of the rows this answer ranked, cropped to their own bounding box.
 *
 * The gate is data, never model text. A map is drawn only when all four of
 * these hold, so the picture cannot claim a geography the answer does not have:
 *
 *   (a) *this* message names a US state or one of the nine Census divisions,
 *       out of the closed lists below — a follow-up such as "the second one"
 *       does not get a map even while the carried context is still New England;
 *   (b) this turn's `queryAirports` filtered on `region` or `state` — an IATA
 *       compare and a peer-group question are not a place;
 *   (c) two or more of the returned rows carry a coordinate — one pin is not a
 *       set, and an airport the snapshot does not locate is not a pin;
 *   (d) the answer is a ranking rather than a single-metric lookup, which has
 *       no candidate lamp for a marker to light.
 *
 * Marker hue and words come off the same rows the ranking table drew, so a
 * marker and a row cannot disagree; where they seem to, the table is the source
 * of truth. Land under the dots is the committed Census state outlines (issue
 * #95), projected in the same crop: no tile library, no projection service and
 * no second geography tool. The points are the snapshot's own latitude and
 * longitude.
 */
import type { CandidateLamp, ScoredAirport } from "@repo/scoring";
import { CENSUS_DIVISIONS } from "@repo/snapshot";

import { indexOfPhrase } from "./text.ts";
import { lookupMetric, rankingRows, type JsonObject, type ToolCall } from "./thread-messages.ts";
import { US_STATES, type StateOutline } from "./us-outlines.ts";

/** The drawing box, in SVG user units. The card scales it to its own width. */
export const MAP_WIDTH = 320;
export const MAP_HEIGHT = 200;

/** Breathing room inside the box, so an edge airport is not cut in half. */
export const MAP_PADDING = 18;

/**
 * Room for one IATA code beside its dot, and the gap it sits off by. Three
 * monospace characters at the size the card draws them, rounded up: the code is
 * what makes a marker readable, so a marker near the eastern edge puts its code
 * on the other side rather than letting the crop cut a letter off it.
 */
export const MAP_LABEL_WIDTH = 20;
const MAP_LABEL_GAP = 7;

export type MapMarker = {
  iata: string;
  name: string;
  /** The row's own lamp: the marker's hue and its word come from one value. */
  lamp: CandidateLamp;
  x: number;
  y: number;
  /** Where this marker's code is written: beside the dot, inside the crop. */
  label: { x: number; anchor: "start" | "end" };
};

/** One closed ring of a state outline, in the drawing's own user units. */
export type MapRing = readonly { x: number; y: number }[];

export type MapOutline = {
  state: string;
  rings: readonly MapRing[];
};

export type ResolvedMapView = {
  /**
   * The place the drawn rows are in, spelled as the closed list has it, or null
   * when they share none. It is not simply the word this message used: a
   * heading is a claim about the dots under it.
   */
  place: string | null;
  markers: MapMarker[];
  /** Ranked rows the snapshot does not locate; named rather than dropped. */
  unplaced: string[];
  /**
   * Census state outlines that intersect this crop, in the same projection as
   * the markers. Empty only when no committed ring meets the box — the crop is
   * still the set's bounding box, not a map of the whole country.
   */
  ground: readonly MapOutline[];
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
  const named = placesNamed(question);
  if (named.length === 0 || !filtersByStateOrRegion(call.args)) {
    return null;
  }
  // A lookup withholds the candidate lamp, and a marker is that lamp as a dot,
  // so a picture of one would put back the recommendation the table refused.
  if (lookupMetric(call) !== null) {
    return null;
  }
  const located = rows.filter(isLocated);
  if (located.length < 2) {
    return null;
  }
  const unplaced = rows.filter((row) => !isLocated(row)).map((row) => row.iata);
  const place = placeOf(named, located);
  const frame = frameOf(located);

  return {
    place,
    markers: project(located, frame),
    unplaced,
    ground: groundOf(frame),
    caption: captionOf(place, located.length, unplaced),
    viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
  };
}

/**
 * The fifty states and DC as an analyst spells them, each beside the code the
 * snapshot files its airports under — the name is what a message says and what
 * a heading prints, the code is what a row carries, and the map needs both.
 *
 * Codes are deliberately not accepted as place words: "in", "or", "me" and "ok"
 * are English words before they are states, and a gate whose list cannot be
 * read aloud is a keyword soup.
 */
const STATE_CODES: Readonly<Record<string, string>> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN",
  Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY",
};

/**
 * Every place word this gate accepts. Longest first, so "West Virginia" is read
 * before the "Virginia" inside it and a name is never shortened.
 */
const PLACE_NAMES: readonly string[] = [...CENSUS_DIVISIONS, ...Object.keys(STATE_CODES)].sort(
  (left, right) => right.length - left.length,
);

/**
 * The places this message names, in the order it names them. Empty is the gate:
 * a follow-up such as "the second one" names none, so it gets no map even while
 * the carried context is still New England.
 */
function placesNamed(question: string | null): string[] {
  if (question === null) {
    return [];
  }
  const found: { place: string; at: number }[] = [];
  for (const place of PLACE_NAMES) {
    const at = indexOfPhrase(question, place);
    if (at !== -1) {
      found.push({ place, at });
    }
  }
  return found.sort((left, right) => left.at - right.at).map((entry) => entry.place);
}

/**
 * What the drawing is of, as a heading may say it. The first place this message
 * named that the drawn rows are all actually in — so "New England, not New
 * York" is New England, and a sentence naming two places is labelled by the one
 * the turn answered. Failing that, the division every row shares, which is the
 * true statement left when a message asked about one state and the turn ranked
 * its whole division. Failing that, nothing: a heading over these dots would be
 * a geography the answer does not have.
 */
function placeOf(named: readonly string[], rows: readonly Located[]): string | null {
  return named.find((place) => rowsAreIn(place, rows)) ?? sharedRegion(rows);
}

/** Whether every drawn row is inside one place word: a state, or a division. */
function rowsAreIn(place: string, rows: readonly Located[]): boolean {
  const code = STATE_CODES[place];
  return code === undefined
    ? rows.every((row) => row.region === place)
    : rows.every((row) => row.state === code);
}

/** The one division the rows are all in, or null where they span more than one. */
function sharedRegion(rows: readonly Located[]): string | null {
  const [first] = rows;
  const region = first?.region ?? null;
  return region !== null && rows.every((row) => row.region === region) ? region : null;
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
 * The crop the dots and the outlines share: an equirectangular projection, then
 * the set's own bounding box scaled to fill the drawing on its longer axis.
 * Geography outside that box is clipped, not used to re-zoom the card.
 */
type Frame = {
  narrowing: number;
  longitudes: { middle: number; span: number };
  latitudes: { middle: number; span: number };
  scale: number;
};

function frameOf(rows: readonly Located[]): Frame {
  const latitudes = extent(rows.map((row) => row.latitude));
  // Degrees of longitude are shorter than degrees of latitude away from the
  // equator, and this set's own mid-latitude is the honest amount to narrow
  // them by: it is the only latitude the drawing has to be true at.
  const narrowing = Math.cos((latitudes.middle * Math.PI) / 180);
  const longitudes = extent(rows.map((row) => row.longitude * narrowing));
  // One scale for both axes: a ninety-mile hop reads as a ninety-mile hop, and
  // the shape of New England is not stretched to fill the card.
  const scale = Math.min(
    (MAP_WIDTH - 2 * MAP_PADDING) / longitudes.span,
    (MAP_HEIGHT - 2 * MAP_PADDING) / latitudes.span,
  );
  return { narrowing, longitudes, latitudes, scale };
}

function projectPoint(longitude: number, latitude: number, frame: Frame): { x: number; y: number } {
  return {
    x: round((longitude * frame.narrowing - frame.longitudes.middle) * frame.scale + MAP_WIDTH / 2),
    // North is up, so latitude runs the other way from the SVG's y axis.
    y: round((frame.latitudes.middle - latitude) * frame.scale + MAP_HEIGHT / 2),
  };
}

function project(rows: readonly Located[], frame: Frame): MapMarker[] {
  return rows.map((row) => {
    const { x, y } = projectPoint(row.longitude, row.latitude, frame);
    return {
      iata: row.iata,
      name: row.name,
      lamp: row.candidateLamp,
      x,
      y,
      label: labelFor(x),
    };
  });
}

/**
 * Committed Census rings that meet this crop, in the dots' own projection. A
 * ring wholly outside the box is dropped so Alaska does not ride along with a
 * California ranking; a ring that crosses the edge is kept and the SVG clips it.
 */
function groundOf(frame: Frame): MapOutline[] {
  const drawn: MapOutline[] = [];
  for (const { state, rings } of US_STATES) {
    const visible = rings.map((ring) => projectRing(ring, frame)).filter(ringMeetsCrop);
    if (visible.length > 0) {
      drawn.push({ state, rings: visible });
    }
  }
  return drawn;
}

function projectRing(ring: StateOutline["rings"][number], frame: Frame): MapRing {
  return ring.map(([longitude, latitude]) => projectPoint(longitude, latitude, frame));
}

function ringMeetsCrop(ring: MapRing): boolean {
  const xs = ring.map((point) => point.x);
  const ys = ring.map((point) => point.y);
  const overlapsX = Math.max(...xs) >= 0 && Math.min(...xs) <= MAP_WIDTH;
  const overlapsY = Math.max(...ys) >= 0 && Math.min(...ys) <= MAP_HEIGHT;
  return overlapsX && overlapsY;
}

/**
 * Which side of its dot a code is written on. To the right, where a reader
 * looks for it — unless the code would run out of the crop there, and then to
 * the left, which always has room: the box is far wider than two labels.
 */
function labelFor(x: number): MapMarker["label"] {
  const fitsRight = x + MAP_LABEL_GAP + MAP_LABEL_WIDTH <= MAP_WIDTH;
  return fitsRight
    ? { x: round(x + MAP_LABEL_GAP), anchor: "start" }
    : { x: round(x - MAP_LABEL_GAP), anchor: "end" };
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
function captionOf(place: string | null, placed: number, unplaced: readonly string[]): string {
  const of = place === null ? "" : ` for ${place}`;
  return [
    `${placed} of this answer's ranked airports, placed from the snapshot's own coordinates${of}.`,
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
