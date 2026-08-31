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

export type SortBy = "composite" | Component;

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
