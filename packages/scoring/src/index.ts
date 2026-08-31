export {
  CANDIDATE_LAMPS,
  COMPONENTS,
  COMPONENTS as SCORE_COMPONENTS,
  COMPONENT_LABELS,
  LOOKUP_METRICS,
  LOOKUP_METRIC_LABELS,
  PLACE_FIELDS,
  SORT_KEYS,
  type CandidateLamp,
  type Component,
  type Coverage,
  type LookupMetric,
  type PlaceField,
  type ScoreComponent,
  type ScoreVector,
  type ScoredAirport,
  type SortBy,
} from "./types.ts";
export { MIXED_VECTOR_AT, STRONG_CANDIDATE_AT, WEIGHTS } from "./weights.ts";
export { candidateLamp, scoreUniverse } from "./score.ts";
// The store boundary's half of this module: what a persisted row has to be for
// the answer objects to draw it again.
export { isScoredAirport } from "./scored-row.ts";
// Exported so the agent's `describeMethodology` states the snapshot-wide caveats
// in the same words the rows carry, rather than a second copy of them.
export { sharedAssumptions } from "./caveats.ts";
export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  metricValue,
  placeVocabulary,
  queryAirports,
  type PlaceVocabulary,
  type QueryAirportsArgs,
  type QueryResult,
  type UnknownPlace,
} from "./query.ts";

