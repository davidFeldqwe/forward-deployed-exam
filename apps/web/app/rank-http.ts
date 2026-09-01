/**
 * LLM-free rank HTTP (PRD story 38 / issue #63). A reviewer curls a ranking,
 * one airport, or a two-code compare with no model key. The body is the
 * `queryAirports` result the agent tools already return — same scored universe,
 * same key order — not a second scoring path.
 *
 * No vendor SDK: this module reaches the screen through `agent-tools`, which
 * itself never imports one. Airports stay in the committed snapshot.
 */
import {
  queryAirports,
  type LookupMetric,
  type QueryAirportsArgs,
  type SortBy,
} from "@repo/scoring";

import { scoredUniverse } from "./agent-tools.ts";

export const RANK_PATH = "/api/rank";
export const AIRPORT_PATH = "/api/airports";
export const COMPARE_PATH = "/api/compare";

export type RankQueryExtras = {
  /** Path codes win over any `iata` on the query string. */
  iata?: string | readonly string[];
};

/**
 * The JSON body a curl of one of the three routes receives. A bad `sortBy` or
 * `metric` is the only thing this layer turns into an HTTP error: the screen
 * already refuses those by name, and wrapping them lets the reviewer correct
 * the query instead of reading a 500.
 */
export function rankQueryResponse(url: string, extras?: RankQueryExtras): Response {
  try {
    return Response.json(queryAirports(scoredUniverse(), argsFromUrl(url, extras)));
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

function argsFromUrl(url: string, extras?: RankQueryExtras): QueryAirportsArgs {
  const params = new URL(url, "http://exam.test").searchParams;
  return {
    iata: extras?.iata ?? iataFromSearch(params),
    region: params.get("region"),
    state: params.get("state"),
    municipality: params.get("municipality"),
    peerGroup: params.get("peerGroup"),
    sortBy: params.get("sortBy") as SortBy | null,
    metric: params.get("metric") as LookupMetric | null,
    limit: parseLimit(params.get("limit")),
  };
}

function iataFromSearch(params: URLSearchParams): string | string[] | null {
  const codes = params
    .getAll("iata")
    .flatMap((value) => value.split(","))
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
  if (codes.length === 0) return null;
  if (codes.length === 1) return codes[0] ?? null;
  return codes;
}

function parseLimit(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  return Number(raw);
}
