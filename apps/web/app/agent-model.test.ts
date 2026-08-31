import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateModelAnswer,
  streamModelAnswer,
  type AgentLanguageModel,
  type AgentRequest,
  type ModelAnswer,
} from "./agent-model.ts";
import { AGENT_MAX_STEPS } from "./agent-provider.ts";
import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { assistantMessage, parseThreadMessage } from "./thread-messages.ts";

/**
 * The two loops the one LLM module can run, on a scripted model rather than a
 * paid key. The model object is typed from `agent-model.ts`, so this test names
 * no vendor package and `agent-boundary.test.ts` still sees one importer.
 */

/** What the model says in one turn: prose, a tool call, or both. */
type ScriptedTurn = { text?: string; toolCall?: { name: string; input: unknown } };

type ModelContent = Awaited<ReturnType<AgentLanguageModel["doGenerate"]>>["content"][number];
type ModelStreamPart =
  Awaited<ReturnType<AgentLanguageModel["doStream"]>>["stream"] extends ReadableStream<infer Part>
    ? Part
    : never;

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** A turn that called a tool is not the end of the answer; a turn of prose is. */
const finishReason = (scripted: ScriptedTurn) => (scripted.toolCall ? "tool-calls" : "stop");

const REGION = { region: "New England" };
const PROSE = "PVD leads the New England set.";
const RANK_THEN_ANSWER: ScriptedTurn[] = [
  { toolCall: { name: "queryAirports", input: REGION } },
  { text: PROSE },
];

const REQUEST: AgentRequest = {
  system: "Answer from the committed capacity-pressure screen.",
  messages: [{ role: "user", content: "Which airports in New England are candidates?" }],
};

/**
 * One script, read the same way by `doGenerate` and by `doStream`, so a
 * difference between the two loops is a difference in this module and not in
 * two hand-written fixtures. Prose arrives in two deltas: a streamed answer is
 * accumulated, never a single chunk.
 */
function scriptedModel(script: readonly ScriptedTurn[]): AgentLanguageModel {
  let turn = 0;
  const nextTurn = (): ScriptedTurn => {
    const scripted = script[turn++];
    if (!scripted) {
      throw new Error(`the model was called ${turn} times; the script has ${script.length} turns`);
    }
    return scripted;
  };
  return {
    specificationVersion: "v2",
    provider: "scripted",
    modelId: "scripted",
    supportedUrls: {},
    doGenerate: () => {
      const scripted = nextTurn();
      return Promise.resolve({
        content: content(scripted, turn),
        finishReason: finishReason(scripted),
        usage: USAGE,
        warnings: [],
      });
    },
    doStream: () => {
      const scripted = nextTurn();
      return Promise.resolve({ stream: streamOf(streamParts(scripted, turn)) });
    },
  };
}

/** The scripted call itself, so both loops are handed the same one. */
function toolCallPart({ name, input }: NonNullable<ScriptedTurn["toolCall"]>, turn: number) {
  return {
    type: "tool-call" as const,
    toolCallId: `call-${turn}`,
    toolName: name,
    input: JSON.stringify(input),
  };
}

function content(scripted: ScriptedTurn, turn: number): ModelContent[] {
  const parts: ModelContent[] = [];
  if (scripted.text !== undefined) {
    parts.push({ type: "text", text: scripted.text });
  }
  if (scripted.toolCall) {
    parts.push(toolCallPart(scripted.toolCall, turn));
  }
  return parts;
}

function streamParts(scripted: ScriptedTurn, turn: number): ModelStreamPart[] {
  const parts: ModelStreamPart[] = [{ type: "stream-start", warnings: [] }];
  if (scripted.text !== undefined) {
    const half = Math.ceil(scripted.text.length / 2);
    parts.push(
      { type: "text-start", id: `text-${turn}` },
      { type: "text-delta", id: `text-${turn}`, delta: scripted.text.slice(0, half) },
      { type: "text-delta", id: `text-${turn}`, delta: scripted.text.slice(half) },
      { type: "text-end", id: `text-${turn}` },
    );
  }
  if (scripted.toolCall) {
    parts.push(toolCallPart(scripted.toolCall, turn));
  }
  return [...parts, { type: "finish", finishReason: finishReason(scripted), usage: USAGE }];
}

function streamOf(parts: ModelStreamPart[]): ReadableStream<ModelStreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
}

/** A model whose stream is written out by hand, for a failure no script says. */
function failingModel(doStream: AgentLanguageModel["doStream"]): AgentLanguageModel {
  return { ...scriptedModel([]), doStream };
}

/** The answer as the store holds it: a duration is a measurement, not a value. */
function stored(answer: ModelAnswer) {
  return {
    text: answer.text,
    toolCalls: answer.toolCalls.map(({ durationMs: _durationMs, ...call }) => call),
  };
}

test("a streamed tool loop answers with the prose and the payload it was built from", async () => {
  const answer = await streamModelAnswer(scriptedModel(RANK_THEN_ANSWER), REQUEST);

  assert.equal(answer.text, PROSE);
  assert.deepEqual(stored(answer).toolCalls, [
    {
      tool: "queryAirports",
      args: REGION,
      result: toolPayloadJson(runAgentTool("queryAirports", REGION)),
    },
  ]);
  assert.ok(answer.toolCalls.every((call) => typeof call.durationMs === "number"));
});

test("what the stream stores is what generateText stores", async () => {
  const streamed = await streamModelAnswer(scriptedModel(RANK_THEN_ANSWER), REQUEST);
  const generated = await generateModelAnswer(scriptedModel(RANK_THEN_ANSWER), REQUEST);

  assert.deepEqual(stored(streamed), stored(generated));
  // The thread holds one assistant message, and the store parses what it wrote.
  const message = assistantMessage(streamed.text, streamed.toolCalls);
  assert.deepEqual(parseThreadMessage(JSON.parse(JSON.stringify(message))), message);
});

test("the streamed loop stops at the step cap, however long the model keeps calling", async () => {
  const rankForever: ScriptedTurn[] = Array.from({ length: AGENT_MAX_STEPS + 2 }, () => ({
    toolCall: { name: "queryAirports", input: REGION },
  }));

  const answer = await streamModelAnswer(scriptedModel(rankForever), REQUEST);

  assert.equal(answer.toolCalls.length, AGENT_MAX_STEPS);
});

test("a stream that fails throws the model's own error, so the fallback can read it", async () => {
  const unavailable = failingModel(() => Promise.reject(new Error("model_not_found")));

  await assert.rejects(streamModelAnswer(unavailable, REQUEST), /model_not_found/);
});

test("a stream that fails after prose throws rather than storing the half answer", async () => {
  // `streamText` resolves the prose it did read, so the loop's own guard is the
  // only thing standing between an interrupted answer and the thread.
  const stoppedMidAnswer = failingModel(() =>
    Promise.resolve({
      stream: streamOf([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: PROSE },
        { type: "error", error: new Error("overloaded_error") },
        { type: "finish", finishReason: "stop", usage: USAGE },
      ]),
    }),
  );

  await assert.rejects(streamModelAnswer(stoppedMidAnswer, REQUEST), /overloaded_error/);
});
