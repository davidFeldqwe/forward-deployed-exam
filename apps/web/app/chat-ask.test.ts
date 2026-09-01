import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { afterSuccessfulAsk } from "./chat-land.ts";

const ask = readFileSync(new URL("./chat-ask.ts", import.meta.url), "utf8");
const chat = readFileSync(new URL("../components/Chat.tsx", import.meta.url), "utf8");

test("a follow-up on the open Thread refreshes the payload instead of reloading the document", () => {
  assert.deepEqual(afterSuccessfulAsk("k57bqp2c", "k57bqp2c"), { kind: "refresh" });
});

test("the first question on an empty chat opens the new Thread", () => {
  assert.deepEqual(afterSuccessfulAsk(null, "k57bqp2c"), {
    kind: "open",
    href: "/chat/k57bqp2c",
  });
});

test("a landed ask does not assign the document to the Thread URL", () => {
  assert.doesNotMatch(ask, /window\.location\.assign\(chatDestination/);
  assert.match(chat, /router\.refresh/);
  assert.match(chat, /router\.push/);
});

test("the composer forwards SSE text and complete tool events while the stream is open", () => {
  assert.match(ask, /onEvent/);
  assert.match(ask, /parseChatStreamEvent/);
  assert.match(chat, /applyChatStreamEvent/);
  assert.match(chat, /<PendingAnswer question=\{asked\} messages=\{messages\} stream=\{stream\}/);
});
