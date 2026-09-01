import {
  LOOKUP_METRICS,
  PLACE_FIELDS,
  SORT_KEYS,
  type LookupMetric,
  type PlaceField,
  type ScoredAirport,
  type SortBy,
} from "./types.ts";

/** Locked in the PRD: ten rows unless asked otherwise, never more than 25. */
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 25;

/**
 * Every field is optional, and `null` means the same as leaving the key out: the
 * rank HTTP reads these off a query string, where `searchParams.get` returns
 * `null` for a parameter nobody supplied, and the agent tool takes them from a
 * model that spells "not asked for" as `null` as often as it omits the field.
 * A value of the wrong *type* is still the caller's problem, caught by the tool
 * schema and the query-string parser before this call.
 */
export type QueryAirportsArgs = {
  /** One code or a list; a compare passes two. Filtering by code lifts the default limit. */
  iata?: string | readonly string[] | null;
  region?: string | null;
  state?: string | null;
  municipality?: string | null;
  peerGroup?: string | null;
  sortBy?: SortBy | null;
  /**
   * Asks for one number per airport instead of a ranking (story 30). It orders
   * the rows too — a lookup of delay minutes is read in delay order — so a
   * `sortBy` beside it is not the order the rows come back in and is not
   * reported as one.
   */
  metric?: LookupMetric | null;
  limit?: number | null;
};

/** A supplied place filter with no airport in the scored universe behind it. */
export type UnknownPlace = {
  field: PlaceField;
  /** As the caller wrote it, minus padding, so a refusal can quote the phrase. */
  value: string;
};

export type QueryResult = {
  rows: ScoredAirport[];
  /** Rows that passed the filters, before the limit; `resolvedIata.length`. */
  matched: number;
  /**
   * Every airport the filters resolved to, by code, in the sorted order `rows`
   * pages: story 22's resolved airport set, which the agent names *before* it
   * ranks. `rows` is only that page — twelve airports are in CA against a
   * default limit of ten — so a resolved set read off `rows` names ten of
   * twelve, and lifting the limit to see the rest both floods the answer with
   * score vectors nobody asked for and still stops at 25.
   */
  resolvedIata: string[];
  /** How the rows are ranked, or null when `metric` made this a lookup. */
  sortBy: SortBy | null;
  /**
   * The one number this answer looks up, or null for a ranking. The rows still
   * carry their composite and candidate lamp — a row is one shape, and the
   * stored payload is checked against it — so this is what tells the answer
   * objects to show neither: a lookup is not an investment recommendation.
   */
  metric: LookupMetric | null;
  /** The limit actually applied, after the default and the hard cap. */
  limit: number;
  /**
   * Requested codes with no airport in the scored universe, in the order asked.
   * "LAX vs ITH" returns one row, and without this the caller cannot tell that
   * from a compare that returned both. These are outside the primary-commercial
   * screen, not merely filtered out: a code the place filters excluded is not
   * listed here.
   */
  unknownIata: string[];
  /**
   * Supplied place filters no airport in the scored universe carries, in
   * `PLACE_FIELDS` order. `state: "California"` matches nothing because the
   * snapshot spells a state as two letters, and without this the caller cannot
   * tell that from a filter combination that is legitimately empty — so the
   * agent would answer "no airports in California" with LAX in the screen.
   * Unknown means outside the universe, not excluded by another filter: New
   * England and CA are both real places even though no airport is in both.
   */
  unknownPlace: UnknownPlace[];
};

/** The values each place filter accepts, sorted, for one scored universe. */
export type PlaceVocabulary = Record<PlaceField, string[]>;

/**
 * The place phrases this universe answers to. Story 32 refuses an unresolved
 * place *with* the accepted phrases, and `unknownPlace` only says which one
 * failed; deriving the rest in the app would put universe knowledge outside the
 * module that filters on it, where the two can disagree.
 *
 * A blank is not an accepted phrase: SJU has no Census division, so offering one
 * would hand back a filter that matches nothing. Codes are absent for the same
 * reason they are absent from `PLACE_FIELDS` — an airport is not a place.
 */
export function placeVocabulary(scored: readonly ScoredAirport[]): PlaceVocabulary {
  // Spelled out rather than built from `PLACE_FIELDS`, so a fifth place filter
  // fails to typecheck here instead of quietly going unlisted. The key order is
  // `PLACE_FIELDS`, which is the order an unresolved phrase is reported in.
  return {
    region: acceptedValues(scored, "region"),
    state: acceptedValues(scored, "state"),
    municipality: acceptedValues(scored, "municipality"),
    peerGroup: acceptedValues(scored, "peerGroup"),
  };
}

// The values one place filter accepts: what the universe carries, de-duplicated
// and sorted, blanks left out.
function acceptedValues(scored: readonly ScoredAirport[], field: PlaceField): string[] {
  const values = new Set<string>();
  for (const row of scored) {
    if (row[field] !== null) values.add(row[field]);
  }
  return [...values].sort();
}

/**
 * Filters and sorts already-scored rows. It never recomputes a percentile: a
 * New England question returns the national peer-group composite for those
 * airports, not a New England re-percentile.
 */
export function queryAirports(
  scored: readonly ScoredAirport[],
  args: QueryAirportsArgs = {},
): QueryResult {
  // Arguments are resolved before any work, so a bad `sortBy` is refused rather
  // than reported after a filter the caller never gets to see.
  const codes = requestedCodes(args.iata);
  const ordering = resolveOrdering(args);
  // Naming codes is an explicit ask for those rows, so it lifts the default to
  // the cap: a two-code compare returns both.
  const limit = resolveLimit(args.limit, codes === null ? DEFAULT_LIMIT : MAX_LIMIT);

  const matchedRows = scored.filter(
    (row) =>
      (codes === null || codes.has(row.iata)) &&
      PLACE_FIELDS.every((field) => matches(row[field], args[field])),
  );
  // `filter` already copied, so sorting in place leaves the scored universe
  // untouched. The sort is stable, so airports tied on the sort key keep the
  // snapshot's order, which is enplanements descending.
  matchedRows.sort((left, right) => byDescending(left, right, ordering));

  // The resolved set and its count are one answer, derived from one array, so a
  // caller cannot be told twelve airports matched and handed eleven codes.
  const resolvedIata = matchedRows.map((row) => row.iata);

  return {
    rows: matchedRows.slice(0, limit),
    matched: resolvedIata.length,
    resolvedIata,
    sortBy: ordering.sortBy,
    metric: ordering.metric,
    limit,
    unknownIata: codes === null ? [] : unknownCodes(codes, scored),
    unknownPlace: unknownPlaces(args, scored),
  };
}

// The two spellings of "the caller did not ask": an omitted key and JSON's null.
// An empty string is neither — it is a place phrase or a sort key that was
// supplied and resolves to nothing, which is a different answer.
function unspecified(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

// `sortBy` reaches this module from a query string and from the model, where the
// compile-time type is no help. An unknown key is named rather than left to fail
// as a TypeError inside the comparator, so the caller can correct it.
function resolveSortBy(requested: SortBy | null | undefined): SortBy {
  if (unspecified(requested)) return "composite";
  if (SORT_KEYS.includes(requested)) return requested;
  throw new RangeError(
    `sortBy must be one of ${SORT_KEYS.join(", ")}; received ${JSON.stringify(requested)}`,
  );
}

/**
 * How the rows are ordered: a ranking's sort key, or the one number a lookup
 * shows. Exactly one of the two, because a lookup is read in the order of the
 * column in front of the analyst — so a `sortBy` passed beside a `metric` is not
 * the order the rows came back in, and is not reported as one.
 */
type Ordering =
  | { sortBy: SortBy; metric: null }
  | { sortBy: null; metric: LookupMetric };

function resolveOrdering(args: QueryAirportsArgs): Ordering {
  const metric = resolveMetric(args.metric);
  return metric === null
    ? { sortBy: resolveSortBy(args.sortBy), metric: null }
    : { sortBy: null, metric };
}

// A lookup metric reaches this module the same way `sortBy` does, so it is
// checked the same way: named back to the caller rather than left to read
// `undefined` off a row it does not have.
function resolveMetric(requested: LookupMetric | null | undefined): LookupMetric | null {
  if (unspecified(requested)) return null;
  if (LOOKUP_METRICS.includes(requested)) return requested;
  throw new RangeError(
    `metric must be one of ${LOOKUP_METRICS.join(", ")}; received ${JSON.stringify(requested)}`,
  );
}

// The codes asked for, normalised. A Set both de-duplicates them and keeps the
// order they were given in, which is the order `unknownIata` reads back in, so
// a refusal reads as the question was asked. An explicitly empty list asks for
// no airports, which is not the same as passing no `iata` at all.
function requestedCodes(iata: QueryAirportsArgs["iata"]): ReadonlySet<string> | null {
  if (unspecified(iata)) return null;
  const codes = typeof iata === "string" ? [iata] : iata;
  return new Set(codes.map((code) => code.trim().toUpperCase()));
}

// Outside the screened universe, which is not the same as excluded by a filter:
// a code the place filters dropped is still an airport this module can score.
function unknownCodes(codes: ReadonlySet<string>, scored: readonly ScoredAirport[]): string[] {
  const universe = new Set(scored.map((row) => row.iata));
  return [...codes].filter((code) => !universe.has(code));
}

// A place phrase the screen cannot resolve, reported rather than refused: an
// unknown place legitimately has no airports, so zero rows is the honest answer
// — it just has to be distinguishable from a real place with no rows. Asked of
// the whole universe, not the matched rows, so one filter never makes another
// look unresolved.
function unknownPlaces(
  args: QueryAirportsArgs,
  scored: readonly ScoredAirport[],
): UnknownPlace[] {
  const unknown: UnknownPlace[] = [];
  for (const field of PLACE_FIELDS) {
    const wanted = args[field];
    if (unspecified(wanted)) continue;
    if (!scored.some((row) => matches(row[field], wanted))) {
      unknown.push({ field, value: wanted.trim() });
    }
  }
  return unknown;
}

// Place phrases are resolved to snapshot values before the query, so matching is
// exact apart from case and padding: this function never guesses a place.
function matches(value: string | null, wanted: string | null | undefined): boolean {
  if (unspecified(wanted)) return true;
  return value !== null && value.toLowerCase() === wanted.trim().toLowerCase();
}

function resolveLimit(requested: number | null | undefined, fallback: number): number {
  const asked =
    !unspecified(requested) && Number.isFinite(requested) ? Math.trunc(requested) : fallback;
  return Math.min(Math.max(asked, 1), MAX_LIMIT);
}

function byDescending(left: ScoredAirport, right: ScoredAirport, ordering: Ordering): number {
  const leftValue = orderValue(left, ordering);
  const rightValue = orderValue(right, ordering);
  // A withheld number is not a low one, so it sorts to the end either way.
  if (leftValue === null) return rightValue === null ? 0 : 1;
  if (rightValue === null) return -1;
  return rightValue - leftValue;
}

/**
 * A ranking is ordered on the composite or a component's percentile; a lookup is
 * ordered on the raw number it prints, so the same component key reads a
 * different field depending on which answer this is.
 */
function orderValue(row: ScoredAirport, ordering: Ordering): number | null {
  if (ordering.metric !== null) {
    return metricValue(row, ordering.metric);
  }
  return ordering.sortBy === "composite"
    ? row.composite
    : row.scoreVector[ordering.sortBy].percentile;
}

/**
 * The number a single-metric lookup shows for one airport: the component's raw
 * value, or long-haul share, which lives on the row rather than in the vector.
 * Exported because the answer objects print this column and would otherwise
 * re-derive which field a metric reads from.
 */
export function metricValue(row: ScoredAirport, metric: LookupMetric): number | null {
  return metric === "longHaulShare" ? row.longHaulShare : row.scoreVector[metric].raw;
}
