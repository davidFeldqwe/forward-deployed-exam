/**
 * The Thread store seam: one persisted conversation per signed-in analyst,
 * owned by the account that started it. Convex owns Threads once a deployment
 * exists (PRD: Convex stores Auth and Threads only, never airports or scores);
 * until then this process holds them, so threads survive a refresh but not a
 * restart.
 */
import { randomBytes } from "node:crypto";

import { normalizeEmail } from "./auth-accounts.ts";
import {
  type ThreadMessage,
  parseThreadMessage,
  threadTitle,
  userMessage,
} from "./thread-messages.ts";

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
 * The store hangs off `globalThis` because Next bundles the page graph and the
 * server-action graph separately: a module-level Map would give the action that
 * writes a thread and the page that renders it a store each.
 */
function threadsById(): Map<string, Thread> {
  const host = globalThis as unknown as ThreadHost;
  host.__aiiThreadStore ??= new Map();
  return host.__aiiThreadStore;
}

function newThreadId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * A thread the analyst can only read back through their own account. The owner
 * is keyed the way sign-in keys an account, so it is the same analyst however
 * they typed their email.
 */
function ownedThread(ownerEmail: string, threadId: string): Thread | null {
  const thread = threadsById().get(threadId);
  return thread && thread.ownerEmail === normalizeEmail(ownerEmail)
    ? thread
    : null;
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
    ownerEmail: normalizeEmail(ownerEmail),
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

/**
 * A question from the composer, landed in the thread it belongs to. An open
 * thread the analyst owns takes the question as a follow-up; anything else —
 * no thread yet, someone else's id from a forged form, or a thread this
 * process no longer holds after a restart — opens a new one, because a
 * question that was typed and sent must not be dropped on the floor. Only a
 * question with nothing in it is refused.
 */
export function recordQuestion(
  ownerEmail: string,
  openThreadId: string | null,
  question: string,
): Thread | null {
  const followUp = openThreadId
    ? appendMessage(ownerEmail, openThreadId, userMessage(question))
    : null;
  return followUp ?? startThread(ownerEmail, question);
}

/**
 * A thread the analyst owns. Its messages are handed back without re-parsing
 * because every write went through `parseThreadMessage`. A Convex-backed read
 * hands over a document this process never validated, so it has to run the
 * messages back through it.
 */
export function readThread(ownerEmail: string, threadId: string): Thread | null {
  const thread = ownedThread(ownerEmail, threadId);
  return thread ? snapshotOf(thread) : null;
}

/**
 * The analyst's threads for the header recents control, most recent first.
 * Insertion order is the recents order — `appendMessage` re-inserts the thread
 * just spoken in — which is what an index on (owner, updatedAt) will do in
 * Convex without depending on two writes landing in different milliseconds.
 */
export function listThreads(ownerEmail: string): ThreadSummary[] {
  const owner = normalizeEmail(ownerEmail);
  return [...threadsById().values()]
    .filter((thread) => thread.ownerEmail === owner)
    .reverse()
    .map(({ id, title }) => ({ id, title }));
}

/** Where `/` sends a signed-in analyst: their last thread, or an empty chat. */
export function latestThreadId(ownerEmail: string): string | null {
  return listThreads(ownerEmail)[0]?.id ?? null;
}
