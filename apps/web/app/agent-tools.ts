/**
 * The agent's two tools, and nothing else (PRD story 33): `queryAirports` runs
 * the capacity-pressure screen, `describeMethodology` says how that screen
 * works. Every number the transcript shows comes back through here, so the
 * model writes prose about a payload it was handed rather than one it recalled.
 *
 * No LLM import: this module is what the model calls, not how it is called.
 * `app/agent-model.ts` is the one module that imports a vendor SDK.
 */
import {
  CANDIDATE_LAMPS,
  COMPONENTS,
  COMPONENT_LABELS,
  LOOKUP_METRICS,
  MAX_LIMIT,
  MIXED_VECTOR_AT,
  SORT_KEYS,
  STRONG_CANDIDATE_AT,
  WEIGHTS,
  placeVocabulary,
  queryAirports,
  scoreUniverse,
  sharedAssumptions,
  type CandidateLamp,
  type Component,
  type PlaceVocabulary,
  type QueryResult,
  type ScoredAirport,
} from "@repo/scoring";
import { loadSnapshot, peerGroupSchema } from "@repo/snapshot";
import { z } from "zod";

import type { AgentTool, JsonValue } from "./thread-messages.ts";

/**
 * The screen, scored once per process. `queryAirports` filters these rows; it
 * never re-percentiles, so two questions in one thread rank against the same
 * national distribution rather than against whatever each one matched.
 */
let universe: ScoredAirport[] | null = null;

export function scoredUniverse(): ScoredAirport[] {
  universe ??= scoreUniverse(loadSnapshot());
  return universe;
}

// A code, not a place: the model resolves a phrase to a filter value itself, and
// an airport it invented is reported back as `unknownIata` rather than filtered.
const iataCode = z.string().regex(/^[A-Za-z]{3}$/, "an IATA code is three letters");

/**
 * `nullish` throughout because a model spells "not asked for" as `null` as often
 * as it omits the field, and `queryAirports` reads the two the same way. The
 * enums are the reason an off-list `sortBy` never reaches the module that throws
 * on one: the schema refuses it while the model can still be told what is
 * accepted.
 */
const queryAirportsInput = z.object({
  iata: z.union([iataCode, z.array(iataCode)]).nullish(),
  region: z.string().nullish(),
  state: z.string().nullish(),
  municipality: z.string().nullish(),
  peerGroup: peerGroupSchema.nullish(),
  sortBy: z.enum(SORT_KEYS).nullish(),
  metric: z.enum(LOOKUP_METRICS).nullish(),
  limit: z.number().int().min(1).max(MAX_LIMIT).nullish(),
});

const describeMethodologyInput = z.object({});

export type QueryAirportsInput = z.infer<typeof queryAirportsInput>;

/** How the screen works, for the tool that has to say so without guessing. */
export type MethodologyReport = {
  comparisonWindow: { firstYear: number; secondYear: number };
  /** Ingest timestamp; with the comparison window it is the snapshot's as-of. */
  asOf: string;
  universe: { airports: number; joinKey: string; peerGroups: string[] };
  components: { key: Component; label: string; weight: number; unit: string }[];
  composite: string;
  candidateLamp: { lamp: CandidateLamp; when: string }[];
  longHaulShare: { basis: string; thresholdMiles: number; note: string };
  /** What each place filter accepts, derived from the universe, not kept by hand. */
  acceptedPlacePhrases: PlaceVocabulary;
  assumptions: string[];
  gaps: string[];
  sources: { id: string; name: string; url: string; vintage: string }[];
};

const LAMP_RULES: Readonly<Record<CandidateLamp, string>> = {
  "Strong candidate": `composite ${STRONG_CANDIDATE_AT} or above, all four components present`,
  "Mixed vector": `composite ${MIXED_VECTOR_AT} to ${STRONG_CANDIDATE_AT - 1}, all four present`,
  "Weak candidate": `composite below ${MIXED_VECTOR_AT}, all four present`,
  "Partial inputs": "at least one component missing, so the composite is withheld",
  "No data": "no composite available",
};

export type ToolPayload = { queryAirports: QueryResult; describeMethodology: MethodologyReport };

export const AGENT_TOOL_SPECS = {
  queryAirports: {
    description:
      "Rank or look up airports in the committed capacity-pressure screen. Filters are " +
      "resolved place values, not phrases to geocode: region is one of the nine US Census " +
      "divisions, state is a two-letter code, municipality is the snapshot's city name, " +
      "peerGroup is an FAA hub size. Percentiles are national within the peer group and are " +
      "never recomputed for a filtered set. Pass metric for a single-metric lookup: one number " +
      "per airport, such as delay minutes or long-haul share, answered with that number and " +
      "no composite and no candidate lamp. Call describeMethodology for the accepted values.",
    inputSchema: queryAirportsInput,
    execute: (args: QueryAirportsInput): QueryResult => queryAirports(scoredUniverse(), args),
  },
  describeMethodology: {
    description:
      "The screen's own account of itself: comparison window, component units and weights, " +
      "how the composite and the candidate lamp are derived, the place phrases each filter " +
      "accepts, the snapshot's sources, assumptions and data gaps.",
    inputSchema: describeMethodologyInput,
    execute: (): MethodologyReport => methodologyReport(),
  },
} as const satisfies Record<
  AgentTool,
  { description: string; inputSchema: z.ZodType; execute: (args: never) => unknown }
>;

/**
 * One tool call, arguments validated first. The schema is the boundary the
 * model's JSON crosses, so an off-list sort key or a four-letter code is a
 * refusal the model can read and correct rather than a thrown comparator.
 */
export function runAgentTool<Name extends AgentTool>(name: Name, args: unknown): ToolPayload[Name] {
  const spec = AGENT_TOOL_SPECS[name];
  // The spec's `execute` is typed per tool; `name` is generic here, so the one
  // cast stands for "this tool's schema output goes to this tool's execute".
  const execute = spec.execute as (input: unknown) => ToolPayload[Name];
  return execute(spec.inputSchema.parse(args ?? {}));
}

/** The payload as the store will hold it: the JSON round trip is real, not a cast. */
export function toolPayloadJson(payload: unknown): JsonValue {
  return JSON.parse(JSON.stringify(payload)) as JsonValue;
}

function methodologyReport(): MethodologyReport {
  const snapshot = loadSnapshot();
  const vocabulary = placeVocabulary(scoredUniverse());
  return {
    comparisonWindow: snapshot.comparisonWindow,
    asOf: snapshot.asOf,
    universe: {
      airports: snapshot.airports.length,
      joinKey: snapshot.joinKey,
      peerGroups: vocabulary.peerGroup,
    },
    components: COMPONENTS.map((component) => ({
      key: component,
      label: COMPONENT_LABELS[component],
      weight: WEIGHTS[component],
      unit: snapshot.methodology.units[component],
    })),
    composite:
      "The weighted mean of the four percentiles, rounded. Every component must be present; " +
      "a missing input is never zero-filled and the rest are never re-weighted.",
    candidateLamp: CANDIDATE_LAMPS.map((lamp) => ({ lamp, when: LAMP_RULES[lamp] })),
    longHaulShare: {
      ...snapshot.methodology.longHaulShare,
      note: "A lookup, not a score-vector component, and never part of the composite.",
    },
    acceptedPlacePhrases: vocabulary,
    assumptions: sharedAssumptions(snapshot),
    gaps: snapshot.gaps,
    sources: snapshot.sources,
  };
}
