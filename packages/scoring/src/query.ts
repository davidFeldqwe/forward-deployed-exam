import {
  PLACE_FIELDS,
  SORT_KEYS,
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
  /** Rows that passed the filters, before the limit. */
  matched: number;
  sortBy: SortBy;
  /** The limit actually applied, after the default and the hard cap. */
  limit: number;
  /**
   * Requested codes with no airport in the scored universe, in the order asked.
   * "LAX vs ITH" returns one row, and without this the caller cannot tell that
   * from a compare that returned both. These are outside the top-100 screen, not
   * merely filtered out: a code the place filters excluded is not listed here.
   */
  unknownIata: string[];
  /**
   * Supplied place filters no airport in the scored universe carries, in
   * `PLACE_FIELDS` order. `state: "California"` matches nothing because the
   * snapshot spells a state as two letters, and without this the caller cannot
   * tell that from a filter combination that is legitimately empty -- so the
   * agent would answer "no airports in California" with LAX in the screen.
   * Unknown means outside the universe, not excluded by another filter: New
   * England and CA are both real places even though no airport is in both.
   */
  unknownPlace: UnknownPlace[];
};

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
  const sortBy = resolveSortBy(args.sortBy);
  // Naming codes is an explicit ask for those rows, so it lifts the default to
  // the cap: a two-code compare returns both.
  const limit = resolveLimit(args.limit, codes === null ? DEFAULT_LIMIT : MAX_LIMIT);
  const requested = codes === null ? null : new Set(codes);

  const matchedRows = scored.filter(
    (row) =>
      (requested === null || requested.has(row.iata)) &&
      PLACE_FIELDS.every((field) => matches(row[field], args[field])),
  );
  // `filter` already copied, so sorting in place leaves the scored universe
  // untouched. The sort is stable, so airports tied on the sort key keep the
  // snapshot's order, which is enplanements descending.
  matchedRows.sort((left, right) => byDescending(left, right, sortBy));

  return {
    rows: matchedRows.slice(0, limit),
    matched: matchedRows.length,
    sortBy,
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

// The codes asked for, normalised and de-duplicated, in the order given: the
// order is what `unknownIata` is reported in, so it reads back as the question
// was asked. An explicitly empty list asks for no airports, which is not the
// same as passing no `iata` at all.
function requestedCodes(iata: QueryAirportsArgs["iata"]): string[] | null {
  if (unspecified(iata)) return null;
  const codes = typeof iata === "string" ? [iata] : iata;
  return [...new Set(codes.map((code) => code.trim().toUpperCase()))];
}

// Outside the screened universe, which is not the same as excluded by a filter:
// a code the place filters dropped is still an airport this module can score.
function unknownCodes(codes: readonly string[], scored: readonly ScoredAirport[]): string[] {
  const universe = new Set(scored.map((row) => row.iata));
  return codes.filter((code) => !universe.has(code));
}

// A place phrase the screen cannot resolve, reported rather than refused: an
// unknown place legitimately has no airports, so zero rows is the honest answer
// -- it just has to be distinguishable from a real place with no rows. Asked of
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

function byDescending(left: ScoredAirport, right: ScoredAirport, sortBy: SortBy): number {
  const leftValue = sortValue(left, sortBy);
  const rightValue = sortValue(right, sortBy);
  // A withheld number is not a low one, so it sorts to the end either way.
  if (leftValue === null) return rightValue === null ? 0 : 1;
  if (rightValue === null) return -1;
  return rightValue - leftValue;
}

function sortValue(row: ScoredAirport, sortBy: SortBy): number | null {
  return sortBy === "composite" ? row.composite : row.scoreVector[sortBy].percentile;
}
