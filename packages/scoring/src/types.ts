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
  "iata" | "name" | "municipality" | "state" | "region" | "peerGroup" | "slotLimit"
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
