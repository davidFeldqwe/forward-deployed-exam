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

type ThreadHost = {
  __aiiThreadStore?: Map<string, Thread>;
  __aiiThreadAsks?: Map<string, Promise<void>>;
};

/**
 * The store hangs off `globalThis` because Next bundles the page graph and the
 * server-action graph separately: a module-level Map would give the action that
 * writes a thread and the page that renders it a store each — and the queue in
 * `askOnThread` a lock each, which is no lock at all.
 */
function threadHost(): ThreadHost {
  return globalThis as unknown as ThreadHost;
}

function threadsById(): Map<string, Thread> {
  const host = threadHost();
  host.__aiiThreadStore ??= new Map();
  return host.__aiiThreadStore;
}

/** Each thread's queue of asks, held as its tail: what the next one waits on. */
function askQueues(): Map<string, Promise<void>> {
  const host = threadHost();
  host.__aiiThreadAsks ??= new Map();
  return host.__aiiThreadAsks;
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

/**
 * How an ask gets its answer: the agent, handed the thread as the question left
 * it. A parameter, so the store keeps its distance from the model the way
 * `answerQuestion` does — and so the SSE route can pass a streaming runner that
 * appends the same one assistant message at the end.
 */
export type AnswerTurn = (thread: Thread) => Promise<ThreadMessage>;

/**
 * One ask, whole: the question is stored, the agent runs on the thread that
 * question landed in, and the answer is appended — with no other ask on that
 * thread getting between the three. The composer holds Send while a question is
 * in flight, but a second tab or a re-posted form never went through that
 * composer, and two asks interleaving here put the reply to the first question
 * under the second.
 *
 * Overlapping asks are queued rather than refused: both questions were typed
 * and sent, and the one that waits is answered with the first answer already in
 * its context, which is what a follow-up asked a moment later should see. The
 * answer's own failures stay the caller's — `answerQuestion` returns a message
 * for every path it has, so a thrown error here is a bug rather than a model
 * that said no, and it still leaves the thread free for the next ask.
 */
export async function askOnThread(
  ownerEmail: string,
  openThreadId: string | null,
  question: string,
  answer: AnswerTurn,
): Promise<Thread | null> {
  const ask = async (): Promise<Thread | null> => {
    const thread = recordQuestion(ownerEmail, openThreadId, question);
    if (!thread) {
      return null;
    }
    // A refused answer — a payload the store will not take — leaves the thread
    // as the question left it, rather than nothing at all.
    return appendMessage(ownerEmail, thread.id, await answer(thread)) ?? thread;
  };

  // An ask naming no thread opens one nobody can be holding yet, so it takes no
  // turn at all.
  return openThreadId ? inTurnOn(askKey(ownerEmail, openThreadId), ask) : ask();
}

/**
 * What an ask queues on: the thread it was sent to, under the account asking.
 * Keying by the asker means an ask on a forged id — which opens that asker's
 * own thread rather than touching the owner's — waits on no one else's ask.
 */
function askKey(ownerEmail: string, threadId: string): string {
  return `${normalizeEmail(ownerEmail)}\n${threadId}`;
}

/** Runs `work` after every ask already queued on `key` has finished. */
function inTurnOn<T>(key: string, work: () => Promise<T>): Promise<T> {
  const asks = askQueues();
  const turn = (asks.get(key) ?? Promise.resolve()).then(work);
  // The queue carries the order and nothing else: an ask that fails must still
  // let the next one run, so what the next one waits on cannot reject.
  const finished = turn.then(
    () => {},
    () => {},
  );
  asks.set(key, finished);
  void finished.then(() => {
    // Only the last ask in the queue clears it; an ask that arrived while this
    // one was finishing is already waiting on itself.
    if (asks.get(key) === finished) {
      asks.delete(key);
    }
  });
  return turn;
}
