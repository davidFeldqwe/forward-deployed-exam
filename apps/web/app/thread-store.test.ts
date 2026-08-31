import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type ToolCall,
  assistantMessage,
  userMessage,
} from "./thread-messages.ts";
import {
  appendMessage,
  latestThreadId,
  listThreads,
  readThread,
  recordQuestion,
  startThread,
} from "./thread-store.ts";

const NEW_ENGLAND = "Which airports in New England are renovation-investment candidates?";

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
