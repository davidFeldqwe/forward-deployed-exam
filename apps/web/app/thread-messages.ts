/**
 * What a Thread is made of: messages, the tool payloads they carry, and the
 * title the first user question gives the thread (CONTEXT.md). The message list
 * is the only record of an answer — there is no second store for the last
 * resolved set, so a follow-up reads prior tool payloads back out of it, and
 * every message crossing the store boundary is checked in both directions.
 */
import { isScoredAirport, type ScoredAirport } from "@repo/scoring";

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
 * The rows a persisted `queryAirports` call re-renders from, or null when the
 * call is not a ranking. Anything the result carries beside `rows` — the
 * matched count, the sort key — is stored verbatim and read from there.
 */
export function rankingRows(call: ToolCall | undefined): ScoredAirport[] | null {
  return call?.tool === "queryAirports" ? scoredRows(call.result) : null;
}

/**
 * The scored rows a `queryAirports` payload carries, or null when it does not
 * carry a full set of them. One function, so the check a message passes on the
 * way into the store is the check the answer objects read it back through: a
 * payload stored under a looser rule than the re-render runs draws the answer's
 * prose over an empty table.
 *
 * What a row is, is `@repo/scoring`'s call, not a field map kept here: a second
 * copy of `ScoredAirport` drifts — this one used to demand a Census division,
 * which refused the whole answer for a territory airport the snapshot allows to
 * have none.
 */
function scoredRows(result: unknown): ScoredAirport[] | null {
  if (!isRecord(result)) {
    return null;
  }
  const { rows } = result;
  return Array.isArray(rows) && rows.every(isScoredAirport) ? rows : null;
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
  if (value.tool === "queryAirports" && !scoredRows(value.result)) {
    return null;
  }
  return {
    tool: value.tool,
    args: value.args,
    result: value.result,
    durationMs: value.durationMs,
  };
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
