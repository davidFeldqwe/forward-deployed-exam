export type Coverage = "present" | "missing";

export type CandidateLamp =
  | "Strong candidate"
  | "Mixed vector"
  | "Weak candidate"
  | "Partial inputs"
  | "No data";

export type SortBy =
  | "composite"
  | "congestion"
  | "unmetFlightDemand"
  | "delay"
  | "growth";

export type ScoreComponent = {
  percentile: number | null;
  raw: number | null;
  coverage: Coverage;
};

export type ScoreVector = {
  congestion: ScoreComponent;
  unmetFlightDemand: ScoreComponent;
  delay: ScoreComponent;
  growth: ScoreComponent;
};

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
  slotLimit: "Level 2" | "Level 3" | null;
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
