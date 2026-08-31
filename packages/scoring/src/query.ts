import { SORT_KEYS, type ScoredAirport, type SortBy } from "./types.ts";

/** Locked in the PRD: ten rows unless asked otherwise, never more than 25. */
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 25;

export type QueryAirportsArgs = {
  /** One code or a list; a compare passes two. Filtering by code lifts the default limit. */
  iata?: string | readonly string[];
  region?: string;
  state?: string;
  municipality?: string;
  peerGroup?: string;
  sortBy?: SortBy;
  limit?: number;
};

export type QueryResult = {
  rows: ScoredAirport[];
  /** Rows that passed the filters, before the limit. */
  matched: number;
  sortBy: SortBy;
  /** The limit actually applied, after the default and the hard cap. */
  limit: number;
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
  const codes = requestedCodes(args.iata);
  const matched = scored.filter(
    (row) =>
      (codes === null || codes.has(row.iata)) &&
      matches(row.region, args.region) &&
      matches(row.state, args.state) &&
      matches(row.municipality, args.municipality) &&
      matches(row.peerGroup, args.peerGroup),
  );

  const sortBy = resolveSortBy(args.sortBy);
  const limit = resolveLimit(args.limit, codes === null ? DEFAULT_LIMIT : MAX_LIMIT);
  // Stable, so airports tied on the sort key keep the snapshot's order, which is
  // enplanements descending.
  const rows = [...matched].sort((left, right) => byDescending(left, right, sortBy));

  return { rows: rows.slice(0, limit), matched: matched.length, sortBy, limit };
}

// `sortBy` reaches this module from a query string and from the model, where the
// compile-time type is no help. An unknown key is named rather than left to fail
// as a TypeError inside the comparator, so the caller can correct it.
function resolveSortBy(requested: SortBy | undefined): SortBy {
  if (requested === undefined) return "composite";
  if (SORT_KEYS.includes(requested)) return requested;
  throw new RangeError(
    `sortBy must be one of ${SORT_KEYS.join(", ")}; received ${JSON.stringify(requested)}`,
  );
}

function requestedCodes(iata: QueryAirportsArgs["iata"]): Set<string> | null {
  if (iata === undefined) return null;
  const codes = typeof iata === "string" ? [iata] : iata;
  return new Set(codes.map((code) => code.trim().toUpperCase()));
}

// Place phrases are resolved to snapshot values before the query, so matching is
// exact apart from case and padding: this function never guesses a place.
function matches(value: string | null, wanted: string | undefined): boolean {
  if (wanted === undefined) return true;
  return value !== null && value.toLowerCase() === wanted.trim().toLowerCase();
}

function resolveLimit(requested: number | undefined, whenUnset: number): number {
  const asked =
    requested !== undefined && Number.isFinite(requested) ? Math.trunc(requested) : whenUnset;
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
