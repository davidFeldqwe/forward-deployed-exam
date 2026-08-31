import assert from "node:assert/strict";
import { test } from "node:test";

import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { rankingView } from "./ranking-view.ts";
import {
  type ToolCall,
  assistantMessage,
  rankingRows,
  userMessage,
} from "./thread-messages.ts";
import {
  type Thread,
  UNSTORABLE_ANSWER,
  appendMessage,
  askOnThread,
  latestThreadId,
  listThreads,
  readThread,
  recordQuestion,
  startThread,
} from "./thread-store.ts";

const NEW_ENGLAND = "Which airports in New England are renovation-investment candidates?";

/** A pretend agent held mid-answer, and the call that lets it finish. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

/** Lets every job already queued run, so "has not started yet" means it. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** A thread as the transcript reads it: one line per message, in order. */
function textsOf(thread: Thread | null): string[] {
  return (thread?.messages ?? []).map((message) => message.text);
}

test("a thread survives a later read, titled with its first user question", () => {
  const analyst = "refresh@example.com";
  const started = startThread(analyst, `  ${NEW_ENGLAND}  `);

  const reread = readThread(analyst, started.id);

  assert.equal(reread?.title, NEW_ENGLAND);
  assert.equal(reread?.ownerEmail, analyst);
  assert.deepEqual(reread?.messages, [userMessage(NEW_ENGLAND)]);
  assert.deepEqual(listThreads(analyst), [{ id: started.id, title: NEW_ENGLAND }]);
});

test("a thread belongs to its owner: nobody else can read, list, or append to it", () => {
  const owner = "owner@example.com";
  const other = "other@example.com";
  const thread = startThread(owner, NEW_ENGLAND);

  assert.equal(readThread(other, thread.id), null);
  assert.equal(appendMessage(other, thread.id, assistantMessage("stolen")), null);
  assert.deepEqual(listThreads(other), []);
  assert.equal(latestThreadId(other), null);
  assert.deepEqual(readThread(owner, thread.id)?.messages, [userMessage(NEW_ENGLAND)]);
});

test("the owner is the account, however they typed their email at sign-in", () => {
  const thread = startThread("Analyst@Example.com", NEW_ENGLAND);

  assert.equal(readThread("  analyst@example.com ", thread.id)?.id, thread.id);
  assert.equal(thread.ownerEmail, "analyst@example.com");
});

test("a new thread starts a new conversation instead of appending to the old ranking", () => {
  const analyst = "newthread@example.com";
  const first = startThread(analyst, NEW_ENGLAND);
  const second = startThread(analyst, "What is long-haul share out of Anchorage?");

  assert.notEqual(second.id, first.id);
  assert.equal(readThread(analyst, first.id)?.messages.length, 1);
  assert.equal(latestThreadId(analyst), second.id);
  assert.deepEqual(
    listThreads(analyst).map((summary) => summary.title),
    ["What is long-haul share out of Anchorage?", NEW_ENGLAND],
  );
});

test("recents puts the thread the analyst last spoke in first", () => {
  const analyst = "recents@example.com";
  const first = startThread(analyst, NEW_ENGLAND);
  const second = startThread(analyst, "How much unmet flight demand is there at SFO?");

  appendMessage(analyst, first.id, assistantMessage("BOS leads at composite 79."));

  assert.equal(latestThreadId(analyst), first.id);
  assert.deepEqual(
    listThreads(analyst).map((summary) => summary.id),
    [first.id, second.id],
  );
});

test("an appended message is stored whole, and a broken payload is refused", () => {
  const analyst = "append@example.com";
  const thread = startThread(analyst, NEW_ENGLAND);
  const answer = assistantMessage("BOS leads at composite 79.", [
    {
      tool: "describeMethodology",
      args: {},
      result: { weights: { congestion: 35, unmetFlightDemand: 35, delay: 20, growth: 10 } },
      durationMs: 4,
    },
  ]);

  assert.deepEqual(appendMessage(analyst, thread.id, answer)?.messages, [
    userMessage(NEW_ENGLAND),
    answer,
  ]);

  const broken = assistantMessage("prose", [
    { tool: "queryAirports", args: {}, result: { rows: [{ iata: "BOS" }] }, durationMs: 9 },
  ]);
  assert.equal(appendMessage(analyst, thread.id, broken), null);
  assert.equal(readThread(analyst, thread.id)?.messages.length, 2);
});

test("a stored thread is a copy, so a caller cannot reach into the store", () => {
  const analyst = "copy@example.com";
  const thread = startThread(analyst, NEW_ENGLAND);
  const methodology: ToolCall = {
    tool: "describeMethodology",
    args: { of: "weights" },
    result: {},
    durationMs: 4,
  };
  appendMessage(analyst, thread.id, assistantMessage("Weights are fixed.", [methodology]));

  const handedOut = readThread(analyst, thread.id)!;
  handedOut.title = "renamed";
  handedOut.messages.push(assistantMessage("not persisted"));
  // A tool payload is nested, so a shallow copy would hand out the store's own.
  handedOut.messages[1]!.toolCalls[0]!.args.of = "edited through the snapshot";
  methodology.args.of = "edited through the message that was appended";

  const reread = readThread(analyst, thread.id);
  assert.equal(reread?.title, NEW_ENGLAND);
  assert.equal(reread?.messages.length, 2);
  assert.deepEqual(reread?.messages[1]?.toolCalls, [
    { tool: "describeMethodology", args: { of: "weights" }, result: {}, durationMs: 4 },
  ]);
});

// #34: the live payload is one of the two adapters on this seam, and the
// committed universe holds a territory airport — SJU, which the Census Bureau
// files under no division. A store check stricter than the snapshot refused the
// whole answer, so the analyst got a thread with the question and no ranking.
test("a territory airport's answer stores on the thread and draws again as a ranking row", () => {
  const analyst = "territory@example.com";
  const args = { iata: "SJU" };
  const thread = startThread(analyst, "Is San Juan a renovation-investment candidate?");
  const call: ToolCall = {
    tool: "queryAirports",
    args,
    result: toolPayloadJson(runAgentTool("queryAirports", args)),
    durationMs: 11,
  };

  assert.notEqual(
    appendMessage(analyst, thread.id, assistantMessage("SJU is one row.", [call])),
    null,
  );

  const stored = readThread(analyst, thread.id)?.messages[1]?.toolCalls[0];
  assert.equal(rankingRows(stored)?.[0]?.region, null);
  assert.deepEqual(
    rankingView(stored)?.rows.map((row) => row.iata),
    ["SJU"],
  );
});

test("an unknown thread id is not found rather than fabricated", () => {
  assert.equal(readThread("nobody@example.com", "nosuchthread"), null);
});

test("two copies of this module share one store, as Next's route bundles are", async () => {
  // Next bundles the page graph and the server-action graph separately, so this
  // module is instantiated more than once in one server. A question asked
  // through the action must be readable by the page that renders the thread.
  const asTheAction = await import("./thread-store.ts?bundle=action");
  const asThePage = await import("./thread-store.ts?bundle=page");

  const analyst = "twobundles@example.com";
  const started = asTheAction.startThread(analyst, NEW_ENGLAND);

  assert.equal(asThePage.readThread(analyst, started.id)?.title, NEW_ENGLAND);
  assert.equal(asThePage.latestThreadId(analyst), started.id);
});

test("a thread needs a first question: a blank one is refused, not stored untitled", () => {
  // Recents shows the first user question, so a thread with no question is a
  // blank row that opens a blank transcript. `appendMessage` already refuses a
  // message that cannot render; starting one is held to the same rule.
  const analyst = "blank@example.com";

  assert.equal(startThread(analyst, "   \n\t "), null);
  assert.deepEqual(listThreads(analyst), []);
  assert.equal(latestThreadId(analyst), null);
});

test("a question sent to a thread that is gone opens a new one instead of vanishing", () => {
  // The composer posts the open thread id in a hidden field, so a thread this
  // process no longer holds — every restart, until Convex owns them — used to
  // send the analyst to an empty chat with their question dropped on the floor.
  const analyst = "restarted@example.com";

  const thread = recordQuestion(analyst, "athreadthatisgone", NEW_ENGLAND);

  assert.notEqual(thread, null);
  assert.equal(thread?.title, NEW_ENGLAND);
  assert.deepEqual(thread?.messages, [userMessage(NEW_ENGLAND)]);
  assert.equal(latestThreadId(analyst), thread?.id);
});

test("a question with an open thread the analyst owns is appended to it", () => {
  const analyst = "followup@example.com";
  const thread = startThread(analyst, NEW_ENGLAND)!;

  const same = recordQuestion(analyst, thread.id, "And the second one?");

  assert.equal(same?.id, thread.id);
  assert.equal(same?.title, NEW_ENGLAND);
  assert.deepEqual(same?.messages, [
    userMessage(NEW_ENGLAND),
    userMessage("And the second one?"),
  ]);
  assert.deepEqual(listThreads(analyst), [{ id: thread.id, title: NEW_ENGLAND }]);
});

test("a question aimed at someone else's thread opens the asker's own, leaving theirs alone", () => {
  const owner = "owner-untouched@example.com";
  const other = "forger@example.com";
  const theirs = startThread(owner, NEW_ENGLAND)!;

  const mine = recordQuestion(other, theirs.id, "What is long-haul share out of Anchorage?");

  assert.notEqual(mine?.id, theirs.id);
  assert.equal(mine?.title, "What is long-haul share out of Anchorage?");
  assert.deepEqual(readThread(owner, theirs.id)?.messages, [userMessage(NEW_ENGLAND)]);
  assert.deepEqual(listThreads(owner), [{ id: theirs.id, title: NEW_ENGLAND }]);
});

test("a blank question is refused whether or not a thread is open", () => {
  const analyst = "blankask@example.com";
  const thread = startThread(analyst, NEW_ENGLAND)!;

  assert.equal(recordQuestion(analyst, thread.id, "  \n "), null);
  assert.equal(recordQuestion(analyst, null, ""), null);
  assert.equal(readThread(analyst, thread.id)?.messages.length, 1);
  assert.deepEqual(listThreads(analyst), [{ id: thread.id, title: NEW_ENGLAND }]);
});

// #60: the composer holds Send while a question is in flight, but a second tab
// (or a form posted twice) does not go through that composer. Without a lock on
// the store itself, two asks record both questions first and then append both
// answers, leaving the reply to the first question sitting under the second.
test("two overlapping asks on one thread keep each answer under its own question", async () => {
  const analyst = "overlap@example.com";
  const opened = startThread(analyst, NEW_ENGLAND)!;
  const turns = [gate(), gate()];
  const asked: string[][] = [];
  const answer = async (thread: Thread) => {
    const turn = turns[asked.push(textsOf(thread)) - 1]!;
    await turn.held;
    return assistantMessage(`answering ${thread.messages.at(-1)!.text}`);
  };

  const first = askOnThread(analyst, opened.id, "Which is first?", answer);
  const second = askOnThread(analyst, opened.id, "Which is second?", answer);
  await settle();

  // The second ask has not run, and its question is not stored yet either: one
  // ask holds this thread from the question to the answer under it.
  assert.deepEqual(asked, [[NEW_ENGLAND, "Which is first?"]]);
  assert.deepEqual(textsOf(readThread(analyst, opened.id)), [NEW_ENGLAND, "Which is first?"]);

  for (const turn of turns) {
    turn.release();
  }
  await first;
  const thread = await second;

  // The second ask reads the first answer as context, not as a race it won.
  assert.deepEqual(asked[1], [
    NEW_ENGLAND,
    "Which is first?",
    "answering Which is first?",
    "Which is second?",
  ]);
  assert.deepEqual(textsOf(thread), [
    NEW_ENGLAND,
    "Which is first?",
    "answering Which is first?",
    "Which is second?",
    "answering Which is second?",
  ]);
});

test("an ask waits on its own thread only, not on every thread the analyst has", async () => {
  const analyst = "twothreads@example.com";
  const busy = startThread(analyst, NEW_ENGLAND)!;
  const free = startThread(analyst, "How much unmet flight demand is there at SFO?")!;
  const inFlight = gate();

  const slow = askOnThread(analyst, busy.id, "Hold this thread.", async () => {
    await inFlight.held;
    return assistantMessage("the held answer");
  });
  const other = await askOnThread(analyst, free.id, "Answer here.", async () =>
    assistantMessage("the other answer"),
  );

  assert.deepEqual(textsOf(other), [
    "How much unmet flight demand is there at SFO?",
    "Answer here.",
    "the other answer",
  ]);
  inFlight.release();
  await slow;
});

test("an ask that fails hands the thread on rather than wedging it shut", async () => {
  const analyst = "failedask@example.com";
  const opened = startThread(analyst, NEW_ENGLAND)!;

  await assert.rejects(
    askOnThread(analyst, opened.id, "The one that fails?", async () => {
      throw new Error("the model never answered");
    }),
    /the model never answered/,
  );

  const after = await askOnThread(analyst, opened.id, "The one after it?", async () =>
    assistantMessage("an answer"),
  );

  // The failed ask stored its question, as asking has always done, and left.
  assert.deepEqual(textsOf(after), [
    NEW_ENGLAND,
    "The one that fails?",
    "The one after it?",
    "an answer",
  ]);
});

// #64: a payload the store will not take — today a queryAirports result that
// does not read back as a ranking — used to leave the thread as the question
// left it, so the analyst saw their own question and silence under it.
test("an answer the store refuses still leaves a reply under the question", async () => {
  const analyst = "refusedanswer@example.com";
  const opened = startThread(analyst, NEW_ENGLAND)!;

  const thread = await askOnThread(analyst, opened.id, "Which are candidates?", async () =>
    assistantMessage("BOS leads at composite 79.", [
      { tool: "queryAirports", args: {}, result: { rows: [{ iata: "BOS" }] }, durationMs: 9 },
    ]),
  );

  assert.deepEqual(textsOf(thread), [NEW_ENGLAND, "Which are candidates?", UNSTORABLE_ANSWER]);
  const reply = thread?.messages.at(-1);
  assert.equal(reply?.role, "assistant");
  // The refused payload is not stored in any form, so the transcript draws no
  // ranking: the prose that claimed one is gone with the rows it claimed.
  assert.deepEqual(reply?.toolCalls, []);
  // Nor does the line that replaces it quote a number, so there is nothing in
  // the transcript to read as a score the screen returned.
  assert.doesNotMatch(UNSTORABLE_ANSWER, /\d/);
  assert.deepEqual(textsOf(readThread(analyst, opened.id)), textsOf(thread));
});

test("a blank ask is refused before the agent is run at all", async () => {
  const analyst = "blankaskrun@example.com";
  const opened = startThread(analyst, NEW_ENGLAND)!;

  const refused = await askOnThread(analyst, opened.id, "  \n ", async () => {
    assert.fail("a question with nothing in it must not reach the agent");
  });

  assert.equal(refused, null);
  assert.deepEqual(textsOf(readThread(analyst, opened.id)), [NEW_ENGLAND]);
});

test("the lock is on the store, so both of Next's bundles take one turn each", async () => {
  // The store hangs off `globalThis` because this module is instantiated once
  // per route bundle. A lock held in a module-level Map would be one lock per
  // bundle, which is no lock at all.
  const asTheAction = await import("./thread-store.ts?bundle=action");
  const asThePage = await import("./thread-store.ts?bundle=page");

  const analyst = "bundledask@example.com";
  const opened = asTheAction.startThread(analyst, NEW_ENGLAND)!;
  const inFlight = gate();
  let pageAskRan = false;

  const fromAction = asTheAction.askOnThread(analyst, opened.id, "From the action.", async () => {
    await inFlight.held;
    return assistantMessage("the action's answer");
  });
  const fromPage = asThePage.askOnThread(analyst, opened.id, "From the page.", async () => {
    pageAskRan = true;
    return assistantMessage("the page's answer");
  });
  await settle();

  assert.equal(pageAskRan, false);
  inFlight.release();
  await fromAction;

  assert.deepEqual(textsOf(await fromPage), [
    NEW_ENGLAND,
    "From the action.",
    "the action's answer",
    "From the page.",
    "the page's answer",
  ]);
});
