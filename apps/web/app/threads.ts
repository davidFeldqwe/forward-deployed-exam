/**
 * Threads: one persisted conversation per signed-in analyst, titled with its
 * first user question (CONTEXT.md). The message list is the only record of an
 * answer — there is no second store for the last resolved set, so a follow-up
 * reads prior tool payloads back out of the messages.
 */
import { randomBytes } from "node:crypto";

import {
  CANDIDATE_LAMPS,
  SCORE_COMPONENTS,
  type ScoredAirport,
} from "@repo/scoring";

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
  if (collapsed.length <= THREAD_TITLE_MAX_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, THREAD_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
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
 * call is not a ranking. `parseThreadMessage` has already checked every field
 * of every row against `ScoredAirport` (`RANKING_ROW_CHECKS`), so the cast is
 * checked rather than assumed. Anything the result carries beside `rows` — the
 * matched count, the sort key — is stored verbatim.
 */
export function rankingRows(call: ToolCall | undefined): ScoredAirport[] | null {
  if (!call || call.tool !== "queryAirports") {
    return null;
  }
  const rows = (call.result as { rows?: JsonValue }).rows;
  return Array.isArray(rows) ? (rows as unknown as ScoredAirport[]) : null;
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
  if (!Array.isArray(value.toolCalls)) {
    return null;
  }
  const toolCalls: ToolCall[] = [];
  for (const call of value.toolCalls) {
    const parsed = parseToolCall(call);
    if (!parsed) {
      return null;
    }
    toolCalls.push(parsed);
  }
  // A message with no prose and no tool payload would draw a bare role label.
  if (value.text.trim().length === 0 && toolCalls.length === 0) {
    return null;
  }
  return { role, text: value.text, toolCalls };
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
  region: isNonEmptyString,
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
    Object.entries(RANKING_ROW_CHECKS).every(([field, check]) => check(row[field]))
  );
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

/** The FAA schedule constraints, exhaustive over scoring's own union. */
const SLOT_LIMITS: Record<NonNullable<ScoredAirport["slotLimit"]>, true> = {
  "Level 2": true,
  "Level 3": true,
};

function isSlotLimit(value: unknown): boolean {
  return (
    value === null || (typeof value === "string" && Object.hasOwn(SLOT_LIMITS, value))
  );
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

export type Thread = {
  id: string;
  ownerEmail: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ThreadMessage[];
};

/** A recents entry: the id to open and the first user question to show. */
export type ThreadSummary = {
  id: string;
  title: string;
};

type ThreadHost = { __aiiThreadStore?: Map<string, Thread> };

/**
 * The Thread store seam. Convex owns Threads once a deployment exists (PRD:
 * Convex stores Auth and Threads only, never airports or scores); until then
 * this process holds them, so threads survive a refresh but not a restart.
 *
 * It hangs off `globalThis` because Next bundles the page graph and the
 * server-action graph separately: a module-level Map would give the action that
 * writes a thread and the page that renders it a store each.
 *
 * Insertion order is the recents order: a thread that gets a new message is
 * re-inserted at the end, which is what an index on (owner, updatedAt) will do
 * in Convex without depending on two writes landing in different milliseconds.
 *
 * Reads here are unparsed because every write went through
 * `parseThreadMessage`. A Convex-backed `readThread` hands over a document this
 * process never validated, so it has to run the messages back through it.
 */
function threadsById(): Map<string, Thread> {
  const host = globalThis as unknown as ThreadHost;
  host.__aiiThreadStore ??= new Map();
  return host.__aiiThreadStore;
}

/** The same key sign-in stores an account under (`normalizeEmail`). */
function ownerKey(email: string): string {
  return email.trim().toLowerCase();
}

function newThreadId(): string {
  return randomBytes(8).toString("hex");
}

/** A thread the analyst can only read back through their own account. */
function ownedThread(ownerEmail: string, threadId: string): Thread | null {
  const thread = threadsById().get(threadId);
  return thread && thread.ownerEmail === ownerKey(ownerEmail) ? thread : null;
}

/** Handed out as a copy, so a caller cannot edit the store by accident. */
function snapshotOf(thread: Thread): Thread {
  return structuredClone(thread);
}

/**
 * A new conversation, titled with the question that opened it. A question with
 * nothing in it is refused, the same way `appendMessage` refuses a message that
 * cannot render: recents would show a blank row opening a blank transcript.
 */
export function startThread(ownerEmail: string, question: string): Thread | null {
  const opening = parseThreadMessage(userMessage(question));
  if (!opening) {
    return null;
  }
  const now = Date.now();
  const thread: Thread = {
    id: newThreadId(),
    ownerEmail: ownerKey(ownerEmail),
    title: threadTitle(question),
    createdAt: now,
    updatedAt: now,
    messages: [opening],
  };
  threadsById().set(thread.id, thread);
  return snapshotOf(thread);
}

/**
 * Adds one message to a thread the analyst owns. A message that would not
 * re-render is refused rather than stored half-formed.
 */
export function appendMessage(
  ownerEmail: string,
  threadId: string,
  message: ThreadMessage,
): Thread | null {
  const thread = ownedThread(ownerEmail, threadId);
  const parsed = parseThreadMessage(message);
  if (!thread || !parsed) {
    return null;
  }
  // Stored as a copy, so the caller's message and the store cannot diverge.
  thread.messages.push(structuredClone(parsed));
  thread.updatedAt = Date.now();
  // Re-insert so the thread just spoken in is the most recent one.
  threadsById().delete(thread.id);
  threadsById().set(thread.id, thread);
  return snapshotOf(thread);
}

export function readThread(ownerEmail: string, threadId: string): Thread | null {
  const thread = ownedThread(ownerEmail, threadId);
  return thread ? snapshotOf(thread) : null;
}

/** The analyst's threads for the header recents control, most recent first. */
export function listThreads(ownerEmail: string): ThreadSummary[] {
  const owner = ownerKey(ownerEmail);
  return [...threadsById().values()]
    .filter((thread) => thread.ownerEmail === owner)
    .reverse()
    .map(({ id, title }) => ({ id, title }));
}

/** Where `/` sends a signed-in analyst: their last thread, or an empty chat. */
export function latestThreadId(ownerEmail: string): string | null {
  return listThreads(ownerEmail)[0]?.id ?? null;
}
