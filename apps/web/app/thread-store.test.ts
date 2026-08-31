import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendMessage,
  assistantMessage,
  latestThreadId,
  listThreads,
  readThread,
  startThread,
  userMessage,
} from "./threads.ts";

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

  thread.messages.push(assistantMessage("not persisted"));
  thread.title = "renamed";

  assert.equal(readThread(analyst, thread.id)?.messages.length, 1);
  assert.equal(readThread(analyst, thread.id)?.title, NEW_ENGLAND);
});

test("an unknown thread id is not found rather than fabricated", () => {
  assert.equal(readThread("nobody@example.com", "nosuchthread"), null);
});
