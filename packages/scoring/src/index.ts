export {
  COMPONENTS,
  COMPONENT_LABELS,
  PLACE_FIELDS,
  SORT_KEYS,
  type CandidateLamp,
  type Component,
  type Coverage,
  type PlaceField,
  type ScoreComponent,
  type ScoreVector,
  type ScoredAirport,
  type SortBy,
} from "./types.ts";
export { MIXED_VECTOR_AT, STRONG_CANDIDATE_AT, WEIGHTS } from "./weights.ts";
export { candidateLamp, scoreUniverse } from "./score.ts";
export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  placeVocabulary,
  queryAirports,
  type PlaceVocabulary,
  type QueryAirportsArgs,
  type QueryResult,
  type UnknownPlace,
} from "./query.ts";

/** Alias of `COMPONENTS` for thread payload checks that import this name. */
export { COMPONENTS as SCORE_COMPONENTS };

/** The candidate lamp, in ranking order. Hue never appears without this text. */
export const CANDIDATE_LAMPS = [
  "Strong candidate",
  "Mixed vector",
  "Weak candidate",
  "Partial inputs",
  "No data",
] as const;

/** FAA schedule constraint levels. No level at all is the common case. */
export const SLOT_LIMIT_LEVELS = ["Level 2", "Level 3"] as const;
