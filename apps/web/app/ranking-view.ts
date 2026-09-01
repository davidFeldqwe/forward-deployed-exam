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
  LOOKUP_METRICS,
  LOOKUP_METRIC_LABELS,
  PLACE_FIELDS,
  SORT_KEYS,
  WEIGHTS,
  metricValue,
  type CandidateLamp,
  type Component,
  type LookupMetric,
  type ScoredAirport,
  type SortBy,
} from "@repo/scoring";
import { peerGroupSchema, type PeerGroup } from "@repo/snapshot";

import { unknownIataRefusal, unknownPlaceRefusal } from "./refusals.ts";
import { rankingRows, type JsonObject, type JsonValue, type ToolCall } from "./thread-messages.ts";

/**
 * A composite the screen withheld, as the table prints it. Named because the
 * ranking table reads it back to know there is no number to put "/100" after.
 */
export const WITHHELD_COMPOSITE = "—";

/**
 * What one member of a peer group is called. Three of the FAA's hub sizes are
 * hubs and the fourth is the primaries that are not one, so a peer group is
 * never printed as "nonhub hub" — a row saying that would be claiming its
 * percentiles are a hub rank. Keyed off `PeerGroup`, so a fifth hub size fails
 * to typecheck here rather than inventing a noun for itself.
 */
const PEER_GROUP_NOUNS: Readonly<Record<PeerGroup, string>> = {
  large: "hub",
  medium: "hub",
  small: "hub",
  nonhub: "airport",
};

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
  /**
   * The composite, or `WITHHELD_COMPOSITE` where the screen withheld one — and
   * null on a lookup, which has no composite column at all: a withheld number
   * and a number nobody asked for are two different absences.
   */
  composite: string | null;
  /** Null on a lookup: a lookup is not an investment recommendation. */
  lamp: CandidateLamp | null;
  /** The one number a lookup prints, formatted; null on a ranking. */
  lookupValue: string | null;
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
  /**
   * The locked refusals for what did not resolve, or null when everything did.
   * They are on the answer object rather than left to the prose, so an analyst
   * is told what the screen accepts even when the model does not say it.
   */
  placeRefusal: string | null;
  iataRefusal: string | null;
};

export type RankingView = {
  resolved: ResolvedSet;
  rows: RankingRowView[];
  /**
   * The single metric this answer looks up, or null when it is a ranking. It is
   * what the table reads to draw one number instead of a composite and a lamp.
   */
  lookup: { key: LookupMetric; label: string } | null;
  /** What the rows are in the order of: the sort key, or the lookup's metric. */
  sortLabel: string;
  assumptions: string[];
  gaps: string[];
  unknown: RankingUnknowns;
};

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
  const metric = metricOf(result.metric);
  const sortLabel = orderLabel(metric, sortKeyOf(result.sortBy));

  return {
    resolved: {
      phrase: phraseOf(call.args),
      codes: resolvedIata,
      summary: summaryOf(resolvedIata.length, rows.length, sortLabel),
    },
    rows: rows.map((row, index) => rowView(row, index + 1, metric)),
    lookup: metric === null ? null : { key: metric, label: LOOKUP_METRIC_LABELS[metric] },
    sortLabel,
    assumptions: uniqueLines(rows, "assumptions"),
    gaps: uniqueLines(rows, "gaps"),
    unknown: unknownsOf(result),
  };
}

/**
 * One row, as a ranking draws it or as a lookup does. A lookup reads the same
 * stored row — the payload is one shape — and prints its one number instead of
 * the composite and the lamp, so a lookup is never dressed as a screen result.
 */
function rowView(row: ScoredAirport, rank: number, metric: LookupMetric | null): RankingRowView {
  const present = COMPONENTS.filter(
    (component) => row.scoreVector[component].coverage === "present",
  ).length;

  return {
    rank,
    iata: row.iata,
    name: row.name,
    ...answerCells(row, metric),
    whyLabels: whyLabels(row),
    peerLabel: `${row.peerGroup} FAA ${PEER_GROUP_NOUNS[row.peerGroup]}s`,
    coverage: `${present} of ${COMPONENTS.length}`,
    vector: COMPONENTS.map((component) => vectorCell(row, component)),
  };
}

/**
 * The three cells the answer shape decides between, filled in one place so they
 * cannot half-agree: a ranking draws the screen's composite and candidate lamp,
 * a lookup draws the one number it was asked for and neither of those.
 */
function answerCells(
  row: ScoredAirport,
  metric: LookupMetric | null,
): Pick<RankingRowView, "composite" | "lamp" | "lookupValue"> {
  if (metric !== null) {
    return { composite: null, lamp: null, lookupValue: lookupValue(row, metric) };
  }
  return {
    // The screen's number, or the mark that says it withheld one.
    composite: row.composite === null ? WITHHELD_COMPOSITE : String(row.composite),
    lamp: row.candidateLamp,
    lookupValue: null,
  };
}

/**
 * The one number a lookup prints. A component keeps the units the vector shows
 * it in; long-haul share is a share, and a missing one says so in words — a
 * lookup of a number the snapshot does not carry is not a zero.
 */
function lookupValue(row: ScoredAirport, metric: LookupMetric): string {
  const value = metricValue(row, metric);
  if (metric === "longHaulShare") {
    return value === null ? "Not reported" : `${(value * 100).toFixed(1)}%`;
  }
  return rawValue(metric, value);
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
  const labels = [`${capitalise(row.peerGroup)} ${PEER_GROUP_NOUNS[row.peerGroup]}`];
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
    parts.push(field === "peerGroup" ? peerGroupPhrase(value) : value);
  }
  parts.push(...codesOf(args.iata));
  return parts.length === 0 ? "Every airport in the screen" : parts.join(" · ");
}

/**
 * A peer-group filter as words: "large hubs", and "nonhub airports" because a
 * nonhub primary is precisely not a hub. The hub size is read off the value the
 * way the screen matches it, on case and padding only, so "Nonhub" resolves to
 * the rows it filtered to rather than being called a hub. A stored value that is
 * not a hub size at all is still printed as it was asked for — the resolved set
 * says what was filtered on, and the unresolved-place list is what reports it
 * matched nothing.
 */
function peerGroupPhrase(value: string): string {
  const asked = peerGroupSchema.safeParse(value.trim().toLowerCase());
  const noun = asked.success ? PEER_GROUP_NOUNS[asked.data] : "hub";
  return `${value} ${noun}s`;
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

/** What the query could not resolve, with the refusal each one is owed. */
function unknownsOf(result: JsonObject): RankingUnknowns {
  const iata = stringsOf(result.unknownIata) ?? [];
  const place = unknownPlacesOf(result.unknownPlace);
  return {
    iata,
    place,
    placeRefusal: unknownPlaceRefusal(place),
    iataRefusal: unknownIataRefusal(iata),
  };
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

function metricOf(value: JsonValue | undefined): LookupMetric | null {
  return LOOKUP_METRICS.find((metric) => metric === value) ?? null;
}

/** What the rows are in the order of, in the words the answer prints elsewhere. */
function orderLabel(metric: LookupMetric | null, sortBy: SortBy): string {
  if (metric !== null) return LOOKUP_METRIC_LABELS[metric].toLowerCase();
  return sortBy === "composite" ? "composite" : COMPONENT_LABELS[sortBy].toLowerCase();
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
