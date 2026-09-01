import assert from "node:assert/strict";
import { test } from "node:test";

import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import {
  applyChatStreamEvent,
  EMPTY_CHAT_STREAM,
  parseChatStreamEvent,
} from "./chat-stream.ts";

const rankingCall = {
  tool: "queryAirports" as const,
  args: { region: "New England" },
  result: toolPayloadJson(runAgentTool("queryAirports", { region: "New England" })),
  durationMs: 12,
};

test("text deltas accumulate as prose and never as a tool call", () => {
  const after = applyChatStreamEvent(
    applyChatStreamEvent(EMPTY_CHAT_STREAM, { type: "text", delta: "PVD leads" }),
    { type: "text", delta: " the set." },
  );
  assert.equal(after.text, "PVD leads the set.");
  assert.deepEqual(after.toolCalls, []);
});

test("a complete tool payload is kept; a half ranking is not an event", () => {
  const kept = parseChatStreamEvent({ type: "tool", call: rankingCall });
  assert.equal(kept?.type, "tool");
  assert.equal(kept?.type === "tool" && kept.call.tool, "queryAirports");

  assert.equal(
    parseChatStreamEvent({
      type: "tool",
      call: {
        tool: "queryAirports",
        args: { region: "New England" },
        result: { rows: [{ iata: "BOS", composite: 50 }] },
        durationMs: 1,
      },
    }),
    null,
  );
});

test("question and done carry the Thread id; junk JSON is dropped", () => {
  assert.deepEqual(parseChatStreamEvent({ type: "question", threadId: "k57bqp2c" }), {
    type: "question",
    threadId: "k57bqp2c",
  });
  assert.equal(parseChatStreamEvent({ type: "text", delta: "" }), null);
  assert.equal(parseChatStreamEvent({ type: "ranking", composite: 79 }), null);
  assert.equal(parseChatStreamEvent(null), null);
});
