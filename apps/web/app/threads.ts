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
  | { [key: string]: JsonValue };

/** One inspectable tool row, stored with the arguments and result it showed. */
export type ToolCall = {
  tool: AgentTool;
  args: { [key: string]: JsonValue };
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
 * call is not a ranking. `parseThreadMessage` has already checked that every
 * row carries the composite, lamp and score vector the transcript draws; the
 * rest of the row is whatever `@repo/scoring` put there, carried verbatim.
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
  return { role, text: value.text, toolCalls };
}

function parseToolCall(value: unknown): ToolCall | null {
  if (
    !isRecord(value) ||
    !isAgentTool(value.tool) ||
    !isRecord(value.args) ||
    !isJsonValue(value.args) ||
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
    args: value.args as { [key: string]: JsonValue },
    result: value.result,
    durationMs: value.durationMs,
  };
}

/**
 * What the ranking, the score vector and the lamp need from a stored
 * `queryAirports` result. The rest of the row is carried verbatim; scoring
 * owns its full shape.
 */
function hasRenderableRows(result: JsonValue): boolean {
  if (!isRecord(result) || !Array.isArray(result.rows)) {
    return false;
  }
  return result.rows.every((row) => {
    if (!isRecord(row) || typeof row.iata !== "string") {
      return false;
    }
    if (row.composite !== null && typeof row.composite !== "number") {
      return false;
    }
    const vector: unknown = row.scoreVector;
    if (!isLamp(row.candidateLamp) || !isRecord(vector)) {
      return false;
    }
    return SCORE_COMPONENTS.every((component) => isScoreComponent(vector[component]));
  });
}

function isScoreComponent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumberOrNull(value.percentile) &&
    isNumberOrNull(value.raw) &&
    (value.coverage === "present" || value.coverage === "missing")
  );
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
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
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
  return { ...thread, messages: thread.messages.map((message) => ({ ...message })) };
}

/** A new conversation, titled with the question that opened it. */
export function startThread(ownerEmail: string, question: string): Thread {
  const now = Date.now();
  const thread: Thread = {
    id: newThreadId(),
    ownerEmail: ownerKey(ownerEmail),
    title: threadTitle(question),
    createdAt: now,
    updatedAt: now,
    messages: [userMessage(question)],
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
  thread.messages.push(parsed);
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
  const summaries: ThreadSummary[] = [];
  for (const thread of threadsById().values()) {
    if (thread.ownerEmail === owner) {
      summaries.unshift({ id: thread.id, title: thread.title });
    }
  }
  return summaries;
}

/** Where `/` sends a signed-in analyst: their last thread, or an empty chat. */
export function latestThreadId(ownerEmail: string): string | null {
  return listThreads(ownerEmail)[0]?.id ?? null;
}
