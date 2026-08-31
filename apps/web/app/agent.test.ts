import assert from "node:assert/strict";
import { test } from "node:test";

import { AGENT_SYSTEM_PROMPT, answerQuestion } from "./agent.ts";
import { NO_PROVIDER_ANSWER } from "./agent-provider.ts";
import { NoProviderError, type ModelAnswer } from "./agent-model.ts";
import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { assistantMessage, parseThreadMessage, userMessage } from "./thread-messages.ts";

const ranking = {
  tool: "queryAirports" as const,
  args: { region: "New England" },
  result: toolPayloadJson(runAgentTool("queryAirports", { region: "New England" })),
  durationMs: 21,
};

test("the answer is an assistant message carrying the payloads it was built from", async () => {
  const answer = await answerQuestion([userMessage("Which airports in New England are candidates?")], async () => ({
    text: "PVD leads the New England set at 87.",
    toolCalls: [ranking],
  }));

  assert.deepEqual(answer, assistantMessage("PVD leads the New England set at 87.", [ranking]));
  assert.deepEqual(parseThreadMessage(JSON.parse(JSON.stringify(answer))), answer);
});

test("the thread so far is what the model is asked about, in order", async () => {
  let seen: ModelAnswer | null = null;
  const captured: { role: string; content: string }[] = [];

  await answerQuestion(
    [userMessage("Which airports in New England are candidates?"), assistantMessage("PVD leads."), userMessage("And Texas?")],
    async (request) => {
      captured.push(...request.messages);
      assert.equal(request.system, AGENT_SYSTEM_PROMPT);
      seen = { text: "", toolCalls: [ranking] };
      return seen;
    },
  );

  assert.deepEqual(captured, [
    { role: "user", content: "Which airports in New England are candidates?" },
    { role: "assistant", content: "PVD leads." },
    { role: "user", content: "And Texas?" },
  ]);
});

test("a deployment with no key stores the question and says so, inventing nothing", async () => {
  const answer = await answerQuestion([userMessage("Rank New England.")], async () => {
    throw new NoProviderError("no key");
  });

  assert.equal(answer.text, NO_PROVIDER_ANSWER);
  assert.deepEqual(answer.toolCalls, []);
  assert.deepEqual(parseThreadMessage(answer), answer);
});

test("a model that fails leaves a message the transcript can still show", async () => {
  const answer = await answerQuestion([userMessage("Rank New England.")], async () => {
    throw new Error("upstream 529");
  });

  assert.ok(answer.text.length > 0);
  assert.deepEqual(parseThreadMessage(answer), answer);
});

test("a ranking with no prose is still an answer, because the table is the answer", async () => {
  const answer = await answerQuestion([userMessage("Rank New England.")], async () => ({
    text: "   ",
    toolCalls: [ranking],
  }));

  assert.deepEqual(answer.toolCalls, [ranking]);
  assert.deepEqual(parseThreadMessage(answer), answer);
});
