/**
 * What a Thread is made of: messages, the tool payloads they carry, and the
 * title the first user question gives the thread (CONTEXT.md). The message list
 * is the only record of an answer — there is no second store for the last
 * resolved set, so a follow-up reads prior tool payloads back out of it, and
 * every message crossing the store boundary is checked in both directions.
 */
import {
  CANDIDATE_LAMPS,
  LOOKUP_METRICS,
  SCORE_COMPONENTS,
  SLOT_LIMIT_LEVELS,
  type LookupMetric,
  type ScoredAirport,
} from "@repo/scoring";

import { clip } from "./text.ts";

/** A recents entry is a title, not a paragraph. */
export const THREAD_TITLE_MAX_LENGTH = 80;

/** The two agent tools, and nothing else, may appear in a transcript. */
export const AGENT_TOOLS = ["queryAirports", "describeMethodology"] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

export type JsonObject = { [key: string]: JsonValue };

/** One inspectable tool row, stored with the arguments and result it showed. */
export type ToolCall = {
  tool: AgentTool;
  args: JsonObject;
  result: JsonValue;
  durationMs: number;
};

export type ThreadRole = "user" | "assistant";

export type ThreadMessage = {
  role: ThreadRole;
  text: string;
  toolCalls: ToolCall[];
};

/** The first user question, as the recents list shows it. */
export function threadTitle(question: string): string {
  const collapsed = question.replace(/\s+/g, " ").trim();
  if (clip(collapsed, THREAD_TITLE_MAX_LENGTH) === collapsed) {
    return collapsed;
  }
  // One character short of the bound, so the ellipsis that says "there was
  // more" fits within it.
  return `${clip(collapsed, THREAD_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

export function userMessage(text: string): ThreadMessage {
  return { role: "user", text: text.trim(), toolCalls: [] };
}

export function assistantMessage(
  text: string,
  toolCalls: ToolCall[] = [],
): ThreadMessage {
  return { role: "assistant", text, toolCalls };
}

/**
 * The question an answer replies to: the nearest user turn above it, or null
 * when there is none. Both the carried context and the map gate read *this*
 * message and no other, so they read it the same way.
 */
export function previousQuestion(
  messages: readonly ThreadMessage[],
  index: number,
): string | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    const message = messages[at];
    if (message?.role === "user") {
      return message.text;
    }
  }
  return null;
}

/**
 * The rows a persisted `queryAirports` call re-renders from, or null when the
 * call is not a ranking. `parseThreadMessage` has already checked every field
 * of every row against `ScoredAirport` (`RANKING_ROW_CHECKS`), so the cast is
 * checked rather than assumed. Anything the result carries beside `rows` — the
 * matched count, the sort key — is stored verbatim.
 */
export function rankingRows(call: ToolCall | undefined): ScoredAirport[] | null {
  if (!call || call.tool !== "queryAirports" || !isRecord(call.result)) {
    return null;
  }
  const { rows } = call.result;
  return Array.isArray(rows) ? (rows as ScoredAirport[]) : null;
}

/**
 * The one metric a persisted `queryAirports` call was asked for, as the result
 * echoes it back, or null when the call is a ranking. Read here rather than in
 * each answer object: the ranking table draws one number instead of a composite
 * and a lamp for a lookup, and the map gate withholds a picture of lamps the
 * answer never lit, so both have to agree on what a lookup is.
 */
export function lookupMetric(call: ToolCall): LookupMetric | null {
  const metric = isRecord(call.result) ? call.result.metric : undefined;
  return LOOKUP_METRICS.find((candidate) => candidate === metric) ?? null;
}

/**
 * A message as it comes back from the store, checked. Convex hands documents
 * over untyped, and a write that dropped a ranking's lamp would render as a
 * blank cell rather than fail, so the boundary is validated in both
 * directions.
 */
export function parseThreadMessage(value: unknown): ThreadMessage | null {
  if (!isRecord(value) || typeof value.text !== "string") {
    return null;
  }
  const role = value.role;
  if (role !== "user" && role !== "assistant") {
    return null;
  }
  const toolCalls = parseToolCalls(value.toolCalls);
  if (!toolCalls) {
    return null;
  }
  // A message with no prose and no tool payload would draw a bare role label.
  if (value.text.trim().length === 0 && toolCalls.length === 0) {
    return null;
  }
  return { role, text: value.text, toolCalls };
}

/** All of a message's tool calls, or null if any one of them is unusable. */
function parseToolCalls(value: unknown): ToolCall[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const calls: ToolCall[] = [];
  for (const call of value) {
    const parsed = parseToolCall(call);
    if (!parsed) {
      return null;
    }
    calls.push(parsed);
  }
  return calls;
}

function parseToolCall(value: unknown): ToolCall | null {
  if (
    !isRecord(value) ||
    !isAgentTool(value.tool) ||
    !isJsonObject(value.args) ||
    !isJsonValue(value.result) ||
    typeof value.durationMs !== "number"
  ) {
    return null;
  }
  if (value.tool === "queryAirports" && !hasRenderableRows(value.result)) {
    return null;
  }
  return {
    tool: value.tool,
    args: value.args,
    result: value.result,
    durationMs: value.durationMs,
  };
}

function hasRenderableRows(result: JsonValue): boolean {
  return isRecord(result) && Array.isArray(result.rows) && result.rows.every(isRankingRow);
}

/**
 * Every field of a stored `queryAirports` row, with the check it has to pass.
 * The map is typed over `keyof ScoredAirport`, so a field added in
 * `@repo/scoring` fails this typecheck until someone says how it is checked:
 * the message list is the only re-render source, so a row that lost a value the
 * answer objects draw — a name, a peer group, an assumption — would render a
 * blank cell or drop a caveat silently rather than fail the write.
 */
const RANKING_ROW_CHECKS: {
  [Field in keyof ScoredAirport]: (value: unknown) => boolean;
} = {
  iata: isNonEmptyString,
  name: isNonEmptyString,
  municipality: isString,
  state: isNonEmptyString,
  region: isRegionOrNone,
  latitude: isDegrees(90),
  longitude: isDegrees(180),
  peerGroup: isNonEmptyString,
  scoreVector: isScoreVector,
  composite: isNumberOrNull,
  candidateLamp: isLamp,
  slotLimit: isSlotLimit,
  longHaulShare: isNumberOrNull,
  assumptions: isStringArray,
  gaps: isStringArray,
};

function isRankingRow(row: unknown): boolean {
  return (
    isRecord(row) &&
    Object.entries(RANKING_ROW_CHECKS).every(([field, check]) => check(row[field])) &&
    isCoordinatePair(row)
  );
}

/**
 * A coordinate the snapshot could carry: degrees, or none. The bound is checked
 * because a stored row is JSON that has been outside this process — an off-world
 * number would put a map marker somewhere the airport is not.
 */
function isDegrees(bound: number): (value: unknown) => boolean {
  return (value) =>
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= bound);
}

/**
 * The snapshot's rule, re-checked here because this is the store boundary: a
 * coordinate is a pair, and half of one is not a point to draw. An airport the
 * source does not locate keeps both nulls and still renders as a ranked row.
 */
function isCoordinatePair(row: Record<string, unknown>): boolean {
  return (row.latitude === null) === (row.longitude === null);
}

function isScoreVector(value: unknown): boolean {
  return (
    isRecord(value) &&
    SCORE_COMPONENTS.every((component) => isScoreComponent(value[component]))
  );
}

function isScoreComponent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumberOrNull(value.percentile) &&
    isNumberOrNull(value.raw) &&
    (value.coverage === "present" || value.coverage === "missing")
  );
}

/** A slot limit, or none: an airport under no FAA schedule constraint. */
function isSlotLimit(value: unknown): boolean {
  return value === null || SLOT_LIMIT_LEVELS.some((level) => level === value);
}

/**
 * A Census division, or none: SJU is in Puerto Rico, which the Census Bureau
 * places in no division at all, and `caveats` says so in words on the row. A
 * check that demanded a division here would refuse the whole message on
 * read-back, so a national ranking that reached Puerto Rico would vanish.
 */
function isRegionOrNone(value: unknown): boolean {
  return value === null || isNonEmptyString(value);
}

function isString(value: unknown): boolean {
  return typeof value === "string";
}

/** A drawn label: a blank one is a hole in the row, not a value. */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isString);
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || typeof value === "number";
}

function isLamp(value: unknown): boolean {
  return CANDIDATE_LAMPS.some((lamp) => lamp === value);
}

function isAgentTool(value: unknown): value is AgentTool {
  return AGENT_TOOLS.some((tool) => tool === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (typeof value === "number") {
    // A stored number has to survive JSON: NaN and Infinity do not.
    return Number.isFinite(value);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isJsonObject(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
