/**
 * The ranking, the resolved airport set, the score vector and the caveats, read
 * off a stored `queryAirports` payload (PRD stories 22-24, 27, 34). The model's
 * prose sits beside these, never behind them: every number here came from the
 * screen, so a sentence that disagrees with the table is visibly the sentence
 * that is wrong.
 */
import {
  COMPONENTS,
  COMPONENT_LABELS,
  PLACE_FIELDS,
  SORT_KEYS,
  WEIGHTS,
  type CandidateLamp,
  type Component,
  type ScoredAirport,
  type SortBy,
} from "@repo/scoring";

import { rankingRows, type JsonObject, type JsonValue, type ToolCall } from "./thread-messages.ts";

/**
 * A composite the screen withheld, as the table prints it. Named because the
 * ranking table reads it back to know there is no number to put "/100" after.
 */
export const WITHHELD_COMPOSITE = "—";

/** Which lamp hue a row lights. Never drawn without the lamp's words beside it. */
export type LampTone = "strong" | "mixed" | "weak" | "none";

export type VectorCell = {
  key: Component;
  label: string;
  /** "88 pctl", or "no data" — a blank is words, not a zero. */
  percentile: string;
  /** Bar length 0-100. Grey: a percentile bar is not a grade. */
  barPercent: number;
  missing: boolean;
  raw: string;
  weight: number;
};

export type RankingRowView = {
  rank: number;
  iata: string;
  name: string;
  /** The composite, or `WITHHELD_COMPOSITE`. Missing is not a low score. */
  composite: string;
  lamp: CandidateLamp;
  tone: LampTone;
  whyLabels: string[];
  peerLabel: string;
  coverage: string;
  vector: VectorCell[];
};

export type ResolvedSet = {
  /** The place phrase the filters resolved, as the tool was called with it. */
  phrase: string;
  /** Every matched code, including the ones past the limit. */
  codes: string[];
  summary: string;
};

export type RankingUnknowns = {
  iata: string[];
  place: { field: string; value: string }[];
};

export type RankingView = {
  resolved: ResolvedSet;
  rows: RankingRowView[];
  sortLabel: string;
  assumptions: string[];
  gaps: string[];
  unknown: RankingUnknowns;
};

const LAMP_TONES: Readonly<Record<CandidateLamp, LampTone>> = {
  "Strong candidate": "strong",
  "Mixed vector": "mixed",
  "Weak candidate": "weak",
  // Coverage states take no hue at all: missing data is never red.
  "Partial inputs": "none",
  "No data": "none",
};

/**
 * Which hue a lamp word lights (issue #25). Exported because the table's rows
 * and the legend that names the five words have to read one mapping: a row and
 * its key cannot disagree about what green means.
 */
export function lampTone(lamp: CandidateLamp): LampTone {
  return LAMP_TONES[lamp];
}

/**
 * The answer objects for one stored tool call, or null when the call is not a
 * ranking. `rankingRows` has already checked every field of every row against
 * `ScoredAirport`, so nothing here has to guess at a half-written payload.
 */
export function rankingView(call: ToolCall | undefined): RankingView | null {
  const rows = rankingRows(call);
  if (!call || !rows) {
    return null;
  }
  // Rows only come back for an object payload, so this reads the rest of that
  // same object — the matched set, the sort key, the unknowns — off it.
  const result = isObject(call.result) ? call.result : {};
  const resolvedIata = stringsOf(result.resolvedIata) ?? rows.map((row) => row.iata);
  const sortBy = sortKeyOf(result.sortBy);
  const sortLabel = sortBy === "composite" ? "composite" : COMPONENT_LABELS[sortBy].toLowerCase();

  return {
    resolved: {
      phrase: phraseOf(call.args),
      codes: resolvedIata,
      summary: summaryOf(resolvedIata.length, rows.length, sortLabel),
    },
    rows: rows.map((row, index) => rowView(row, index + 1)),
    sortLabel,
    assumptions: uniqueLines(rows, "assumptions"),
    gaps: uniqueLines(rows, "gaps"),
    unknown: {
      iata: stringsOf(result.unknownIata) ?? [],
      place: unknownPlacesOf(result.unknownPlace),
    },
  };
}

function rowView(row: ScoredAirport, rank: number): RankingRowView {
  const present = COMPONENTS.filter(
    (component) => row.scoreVector[component].coverage === "present",
  ).length;

  return {
    rank,
    iata: row.iata,
    name: row.name,
    composite: row.composite === null ? WITHHELD_COMPOSITE : String(row.composite),
    lamp: row.candidateLamp,
    tone: lampTone(row.candidateLamp),
    whyLabels: whyLabels(row),
    peerLabel: `${row.peerGroup} FAA hubs`,
    coverage: `${present} of ${COMPONENTS.length}`,
    vector: COMPONENTS.map((component) => vectorCell(row, component)),
  };
}

function vectorCell(row: ScoredAirport, key: Component): VectorCell {
  const { percentile, raw } = row.scoreVector[key];
  const missing = percentile === null;
  return {
    key,
    label: COMPONENT_LABELS[key],
    percentile: missing ? "no data" : `${percentile} pctl`,
    barPercent: missing ? 0 : percentile,
    missing,
    raw: rawValue(key, raw),
    weight: WEIGHTS[key],
  };
}

/**
 * The short units the table shows. The sentence-length unit each one stands for
 * is in the row's own assumptions, which sit under the same answer, so the cell
 * stays a number rather than becoming a paragraph.
 */
function rawValue(key: Component, raw: number | null): string {
  if (raw === null) {
    return "Not reported";
  }
  switch (key) {
    case "congestion":
      return `${compact(raw)} enplanements/runway`;
    case "unmetFlightDemand":
      return `${signed(raw)} pp`;
    case "delay":
      return `${raw.toFixed(1)} min`;
    case "growth":
      return `${signed(raw)}%`;
  }
}

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

/**
 * Why this row is where it is, in words the composite does not carry: its peer
 * group, an FAA schedule constraint, and long-haul share — a lookup, so it is a
 * label rather than a vector slot.
 */
function whyLabels(row: ScoredAirport): string[] {
  const labels = [`${capitalise(row.peerGroup)} hub`];
  if (row.slotLimit !== null) {
    labels.push(`Slot-limited · ${row.slotLimit}`);
  }
  if (row.longHaulShare !== null) {
    labels.push(`Long-haul share ${(row.longHaulShare * 100).toFixed(1)}%`);
  }
  return labels;
}

// The place the filters resolved to, as the tool was called: the arguments are
// on the inspectable tool row too, but the resolved set is read before it.
function phraseOf(args: JsonObject): string {
  const parts: string[] = [];
  for (const field of PLACE_FIELDS) {
    const value = args[field];
    if (typeof value !== "string" || value.trim().length === 0) continue;
    parts.push(field === "peerGroup" ? `${value} hubs` : value);
  }
  parts.push(...codesOf(args.iata));
  return parts.length === 0 ? "Every airport in the screen" : parts.join(" · ");
}

/** One code or a list of them, the two shapes `queryAirports` accepts. */
function codesOf(value: JsonValue | undefined): string[] {
  return typeof value === "string" ? [value] : (stringsOf(value) ?? []);
}

function summaryOf(matched: number, shown: number, sortLabel: string): string {
  const found = `${matched} ${matched === 1 ? "airport" : "airports"} found`;
  return matched > shown ? `${found} · showing the top ${shown} by ${sortLabel}` : found;
}

/**
 * The caveats of the rows this answer shows, de-duplicated in the order they
 * first appear: assumptions and gaps attach to the answer, not to a footer, and
 * eight rows share most of the same lines.
 */
function uniqueLines(rows: readonly ScoredAirport[], key: "assumptions" | "gaps"): string[] {
  const lines = new Set<string>();
  for (const row of rows) {
    for (const line of row[key]) lines.add(line);
  }
  return [...lines];
}

function unknownPlacesOf(value: JsonValue | undefined): { field: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    isObject(entry) && typeof entry.field === "string" && typeof entry.value === "string"
      ? [{ field: entry.field, value: entry.value }]
      : [],
  );
}

function sortKeyOf(value: JsonValue | undefined): SortBy {
  return SORT_KEYS.find((key) => key === value) ?? "composite";
}

function stringsOf(value: JsonValue | undefined): string[] | null {
  if (!Array.isArray(value) || !value.every(isString)) {
    return null;
  }
  return value;
}

function isString(value: JsonValue): value is string {
  return typeof value === "string";
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
