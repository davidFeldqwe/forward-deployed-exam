/**
 * The Thread store seam: one persisted conversation per signed-in analyst,
 * owned by the account that started it. Convex stores Auth and Threads only
 * (PRD), never airports or scores. Tool payloads live on the Thread messages
 * so a ranking re-renders after a process restart.
 */
import { randomBytes } from "node:crypto";

import { SPEND_CAP_REFUSAL, reserveAgentCall } from "./agent-spend.ts";
import { normalizeEmail } from "./auth-accounts.ts";
import {
  type ConvexThread,
  getThread,
  listThreadsByOwner,
  putThread,
} from "./convex-store.ts";
import {
  type ThreadMessage,
  assistantMessage,
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
  __aiiThreadAsks?: Map<string, Promise<void>>;
};

/**
 * Ask queues hang off `globalThis` because Next bundles the page graph and the
 * server-action graph separately: a module-level Map would give each bundle a
 * lock of its own, which is no lock at all. Threads themselves live in the
 * Convex document store, which is the same `globalThis` plus disk.
 */
function threadHost(): ThreadHost {
  return globalThis as unknown as ThreadHost;
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
function ownedThread(ownerEmail: string, threadId: string): Promise<ConvexThread | null> {
  return getThread(threadId, normalizeEmail(ownerEmail));
}

/**
 * Handed out as a copy, messages parsed: Convex (and the on-disk file) can
 * hand back a document this process never validated.
 */
function snapshotOf(thread: ConvexThread): Thread {
  const messages: ThreadMessage[] = [];
  for (const message of thread.messages) {
    const parsed = parseThreadMessage(message);
    if (parsed) {
      messages.push(structuredClone(parsed));
    }
  }
  return {
    id: thread.id,
    ownerEmail: thread.ownerEmail,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages,
  };
}

/**
 * A new conversation, titled with the question that opened it. A question with
 * nothing in it is refused, the same way `appendMessage` refuses a message that
 * cannot render: recents would show a blank row opening a blank transcript.
 */
export async function startThread(ownerEmail: string, question: string): Promise<Thread | null> {
  const opening = parseThreadMessage(userMessage(question));
  if (!opening) {
    return null;
  }
  const now = Date.now();
  const thread: ConvexThread = {
    id: newThreadId(),
    ownerEmail: normalizeEmail(ownerEmail),
    title: threadTitle(question),
    createdAt: now,
    updatedAt: now,
    messages: [opening],
  };
  const stored = await putThread(thread);
  return stored ? snapshotOf(stored) : null;
}

/**
 * Adds one message to a thread the analyst owns. A message that would not
 * re-render is refused rather than stored half-formed.
 */
export async function appendMessage(
  ownerEmail: string,
  threadId: string,
  message: ThreadMessage,
): Promise<Thread | null> {
  const thread = await ownedThread(ownerEmail, threadId);
  const parsed = parseThreadMessage(message);
  if (!thread || !parsed) {
    return null;
  }
  // Stored as a copy, so the caller's message and the store cannot diverge.
  // Re-insert so the thread just spoken in is the most recent one.
  const stored = await putThread({
    ...thread,
    messages: [...thread.messages, structuredClone(parsed)],
    updatedAt: Date.now(),
  });
  return stored ? snapshotOf(stored) : null;
}

/**
 * A question from the composer, landed in the thread it belongs to. An open
 * thread the analyst owns takes the question as a follow-up; anything else —
 * no thread yet, someone else's id from a forged form, or a thread Convex no
 * longer has — opens a new one, because a question that was typed and sent
 * must not be dropped on the floor. Only a question with nothing in it is
 * refused.
 */
export async function recordQuestion(
  ownerEmail: string,
  openThreadId: string | null,
  question: string,
): Promise<Thread | null> {
  const followUp = openThreadId
    ? await appendMessage(ownerEmail, openThreadId, userMessage(question))
    : null;
  return followUp ?? (await startThread(ownerEmail, question));
}

/**
 * A thread the analyst owns. Messages are parsed on the way out: Convex (and
 * the on-disk file) can hand back a document this process never validated.
 */
export async function readThread(ownerEmail: string, threadId: string): Promise<Thread | null> {
  const thread = await ownedThread(ownerEmail, threadId);
  return thread ? snapshotOf(thread) : null;
}

/**
 * The analyst's threads for the header recents control, most recent first.
 * Insertion order is the recents order — `appendMessage` re-inserts the thread
 * just spoken in — which is what an index on (owner, updatedAt) will do in
 * Convex without depending on two writes landing in different milliseconds.
 */
export async function listThreads(ownerEmail: string): Promise<ThreadSummary[]> {
  const threads = await listThreadsByOwner(normalizeEmail(ownerEmail));
  return threads.map(({ id, title }) => ({ id, title }));
}

/** Where `/` sends a signed-in analyst: their last thread, or an empty chat. */
export async function latestThreadId(ownerEmail: string): Promise<string | null> {
  return (await listThreads(ownerEmail))[0]?.id ?? null;
}

/**
 * What the thread shows when the agent answered but the store would not take
 * that answer: today a `queryAirports` payload that does not read back as a
 * ranking (#64), later any parse mismatch. The refused message is stored in no
 * form at all — its prose described rows the transcript would not draw — so the
 * analyst is told the reply was dropped rather than left with their own
 * question and silence under it.
 */
export const UNSTORABLE_ANSWER =
  "The agent answered, but this thread could not store the reply: part of it did not match what " +
  "the screen re-renders, and a ranking is not drawn from a payload that would not read back. " +
  "The question is saved — ask again.";

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
 *
 * The spend cap is this function, not the action that calls it: an SSE `POST`
 * that answers through here is under the same lids, and a route that called
 * the model first would be the bypass the cap is here to close. A capped ask
 * still stores the question; the vendor is what it does not reach.
 */
export async function askOnThread(
  ownerEmail: string,
  openThreadId: string | null,
  question: string,
  answer: AnswerTurn,
  clientIp = "",
  at = Date.now(),
): Promise<Thread | null> {
  const ask = async (): Promise<Thread | null> => {
    const thread = await recordQuestion(ownerEmail, openThreadId, question);
    if (!thread) {
      return null;
    }
    if (!reserveAgentCall({ email: ownerEmail, clientIp, at })) {
      return (
        (await appendMessage(ownerEmail, thread.id, assistantMessage(SPEND_CAP_REFUSAL))) ?? thread
      );
    }
    const answered = await appendMessage(ownerEmail, thread.id, await answer(thread));
    if (answered) {
      return answered;
    }
    // A refused answer is told, not swallowed: `UNSTORABLE_ANSWER` is prose the
    // store cannot refuse in turn, so the only way back from here with no reply
    // under the question is a thread that stopped existing mid-ask.
    return (await appendMessage(ownerEmail, thread.id, assistantMessage(UNSTORABLE_ANSWER))) ?? thread;
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
