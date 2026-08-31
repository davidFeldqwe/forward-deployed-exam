import type { Coverage, SnapshotAirport } from "@repo/snapshot";

export type { Coverage };

// The four score-vector components, in the order the answer objects show them.
// Long-haul share is deliberately absent: it is a lookup, not a vector slot.
export const COMPONENTS = [
  "congestion",
  "unmetFlightDemand",
  "delay",
  "growth",
] as const;

export type Component = (typeof COMPONENTS)[number];

export const COMPONENT_LABELS: Readonly<Record<Component, string>> = {
  congestion: "Congestion",
  unmetFlightDemand: "Unmet flight demand",
  delay: "Delay",
  growth: "Growth",
};

export type CandidateLamp =
  | "Strong candidate"
  | "Mixed vector"
  | "Weak candidate"
  | "Partial inputs"
  | "No data";

/**
 * The accepted `sortBy` values, in the order the answer objects show them:
 * the composite first, then the four vector slots. Exported as values, not just
 * a type, so the rank HTTP and the agent tool validate an outside-supplied key
 * against this list instead of re-typing the strings.
 *
 * Long-haul share is absent for the same reason it is absent from `COMPONENTS`:
 * it is a lookup, not something the screen ranks on.
 */
export const SORT_KEYS = ["composite", ...COMPONENTS] as const;

export type SortBy = (typeof SORT_KEYS)[number];

/**
 * The single numbers one airport can be looked up for (story 30), in the order
 * the answer objects show them: the four vector slots, then long-haul share.
 *
 * Long-haul share is here and absent from `SORT_KEYS` for the same reason: it is
 * a lookup, not something the screen ranks on. A lookup is not a ranking either
 * — the answer shows this one number, and no composite and no candidate lamp —
 * so asking for one is a different argument from asking for a sort.
 */
export const LOOKUP_METRICS = [...COMPONENTS, "longHaulShare"] as const;

export type LookupMetric = (typeof LOOKUP_METRICS)[number];

export const LOOKUP_METRIC_LABELS: Readonly<Record<LookupMetric, string>> = {
  ...COMPONENT_LABELS,
  longHaulShare: "Long-haul share",
};

/**
 * The place filters, in the order an unresolved one is reported. Exported as
 * values for the same reason as `SORT_KEYS`: the rank HTTP reads these off a
 * query string and the agent tool takes them from the model, so both walk one
 * list instead of re-typing four field names that can drift from this module.
 *
 * `iata` is absent: it names airports rather than a place, and a code outside
 * the universe is reported on its own as `unknownIata`.
 */
export const PLACE_FIELDS = ["region", "state", "municipality", "peerGroup"] as const;

export type PlaceField = (typeof PLACE_FIELDS)[number];

export type ScoreComponent = {
  /** Rank inside the airport's national peer group, 0-100; null when missing. */
  percentile: number | null;
  raw: number | null;
  coverage: Coverage;
};

export type ScoreVector = Record<Component, ScoreComponent>;

export type ScoredAirport = Pick<
  SnapshotAirport,
  | "iata"
  | "name"
  | "municipality"
  | "state"
  | "region"
  // The snapshot's OurAirports pair, passed through so the thread can place a
  // resolved airport set without a second lookup. This module never computes on
  // it: a coordinate is not a score, and it is null only as a pair.
  | "latitude"
  | "longitude"
  | "peerGroup"
  | "slotLimit"
> & {
  scoreVector: ScoreVector;
  /** Weighted percentile 0-100, or null whenever a component is missing. */
  composite: number | null;
  candidateLamp: CandidateLamp;
  /** Lookup, not a score-vector slot: share of departures beyond the cutoff. */
  longHaulShare: number | null;
  assumptions: string[];
  gaps: string[];
};
