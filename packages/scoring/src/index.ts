export type Coverage = "present" | "missing";

/** The candidate lamp, in ranking order. Hue never appears without this text. */
export const CANDIDATE_LAMPS = [
  "Strong candidate",
  "Mixed vector",
  "Weak candidate",
  "Partial inputs",
  "No data",
] as const;

export type CandidateLamp = (typeof CANDIDATE_LAMPS)[number];

/** The four score-vector components. Long-haul share is a lookup, not one of them. */
export const SCORE_COMPONENTS = [
  "congestion",
  "unmetFlightDemand",
  "delay",
  "growth",
] as const;

export type ScoreComponentName = (typeof SCORE_COMPONENTS)[number];

export type SortBy = "composite" | ScoreComponentName;

/** FAA schedule constraint levels. No level at all is the common case. */
export const SLOT_LIMIT_LEVELS = ["Level 2", "Level 3"] as const;

export type SlotLimit = (typeof SLOT_LIMIT_LEVELS)[number];

export type ScoreComponent = {
  percentile: number | null;
  raw: number | null;
  coverage: Coverage;
};

export type ScoreVector = Record<ScoreComponentName, ScoreComponent>;

export type ScoredAirport = {
  iata: string;
  name: string;
  municipality: string;
  state: string;
  region: string;
  peerGroup: string;
  scoreVector: ScoreVector;
  composite: number | null;
  candidateLamp: CandidateLamp;
  slotLimit: SlotLimit | null;
  longHaulShare: number | null;
  assumptions: string[];
  gaps: string[];
};

export type QueryAirportsArgs = {
  iata?: string;
  region?: string;
  state?: string;
  municipality?: string;
  peerGroup?: string;
  sortBy: SortBy;
  limit: number;
};

export type QueryResult = {
  rows: ScoredAirport[];
};

// ponytail: empty until a committed snapshot exists; formulas live only here
export function scoreUniverse(_snapshot: unknown): ScoredAirport[] {
  return [];
}

export function queryAirports(
  _scored: ScoredAirport[],
  _args: QueryAirportsArgs,
): QueryResult {
  return { rows: [] };
}

export function candidateLamp(_row: ScoredAirport): CandidateLamp {
  return "No data";
}
