import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import { AGENT_ERROR_ANSWER } from "./agent.ts";
import {
  AGENT_ASKS_PER_EMAIL,
  SPEND_CAP_REFUSAL,
  reserveAgentCall,
  resetAgentSpend,
} from "./agent-spend.ts";
import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { LOGIN_PATH, chatPathWithPrompt, loginRedirect } from "./auth-gate.ts";
import { CHAT_SSE_PATH, chatSseResponse, type ChatSseEvent } from "./chat-sse.ts";
import { threadAnswer } from "./thread-answer.ts";
import { readThread, startThread } from "./thread-store.ts";

const ANALYST = "sse@example.com";
const QUESTION = "Which airports in New England are candidates?";
const REGION = { region: "New England" };
const PROSE = "PVD leads the New England set.";

const rankingCall = {
  tool: "queryAirports" as const,
  args: REGION,
  result: toolPayloadJson(runAgentTool("queryAirports", REGION)),
  durationMs: 12,
};

afterEach(() => {
  resetAgentSpend();
});

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

function askRequest(prompt: string, threadId?: string): Request {
  const body = new FormData();
  body.set("prompt", prompt);
  if (threadId) {
    body.set("threadId", threadId);
  }
  return new Request(`http://exam.test${CHAT_SSE_PATH}`, { method: "POST", body });
}

async function readEvents(response: Response): Promise<ChatSseEvent[]> {
  const text = await response.text();
  const events: ChatSseEvent[] = [];
  for (const block of text.split("\n\n")) {
    const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) {
      continue;
    }
    events.push(JSON.parse(dataLine.slice("data: ".length)) as ChatSseEvent);
  }
  return events;
}

test("a signed-out POST is sent to login and is not an event stream", async () => {
  const response = await chatSseResponse(askRequest(QUESTION), { email: null, clientIp: "203.0.113.9" });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), loginRedirect(chatPathWithPrompt(QUESTION)));
  assert.doesNotMatch(response.headers.get("content-type") ?? "", /event-stream/);
  assert.match(response.headers.get("location") ?? "", new RegExp(`^${LOGIN_PATH}\\?`));
});

test("a signed-in ask streams SSE, stores the question first, then one Thread answer", async () => {
  const opened = startThread(ANALYST, "How congested is BOS?")!;
  let vendorSaw: string[] = [];

  const response = await chatSseResponse(askRequest(QUESTION, opened.id), {
    email: ANALYST,
    clientIp: "203.0.113.9",
    run: async (request, onEvent) => {
      vendorSaw = request.messages.map((turn) => turn.content);
      // The question is already in the thread the model is asked about.
      assert.ok(vendorSaw.includes(QUESTION));
      assert.equal(readThread(ANALYST, opened.id)?.messages.at(-1)?.role, "user");
      assert.equal(readThread(ANALYST, opened.id)?.messages.at(-1)?.text, QUESTION);

      onEvent?.({ type: "tool", call: rankingCall });
      onEvent?.({ type: "text", delta: "PVD leads" });
      onEvent?.({ type: "text", delta: " the New England set." });
      return { text: PROSE, toolCalls: [rankingCall] };
    },
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

  const events = await readEvents(response);
  assert.deepEqual(
    events.map((event) => event.type),
    ["question", "tool", "text", "text", "done"],
  );
  assert.equal(events[0]?.type === "question" && events[0].threadId, opened.id);
  assert.equal(events[1]?.type === "tool" && events[1].call.tool, "queryAirports");
  assert.equal(events.at(-1)?.type === "done" && events.at(-1).threadId, opened.id);

  const stored = readThread(ANALYST, opened.id);
  assert.deepEqual(
    stored?.messages.map((message) => message.role),
    ["user", "user", "assistant"],
  );
  assert.equal(stored?.messages[0]?.text, "How congested is BOS?");
  assert.equal(stored?.messages.at(-2)?.text, QUESTION);
  assert.equal(stored?.messages.at(-1)?.text, PROSE);
  assert.equal(stored?.messages.at(-1)?.toolCalls[0]?.tool, "queryAirports");
  // One stored answer for this ask: the ranking sits on that message.
  assert.equal(stored?.messages.filter((message) => message.role === "assistant").length, 1);
});

test("a failed model still leaves the question in the thread", async () => {
  const opened = startThread(ANALYST, "Compare LAX and SNA.")!;

  const response = await chatSseResponse(askRequest(QUESTION, opened.id), {
    email: ANALYST,
    clientIp: "198.51.100.4",
    run: async () => {
      throw new Error("upstream 529");
    },
  });

  const events = await readEvents(response);
  assert.equal(events[0]?.type, "question");
  assert.equal(events.at(-1)?.type, "done");

  const stored = readThread(ANALYST, opened.id);
  assert.equal(stored?.messages.at(-2)?.text, QUESTION);
  assert.equal(stored?.messages.at(-1)?.text, AGENT_ERROR_ANSWER);
  assert.deepEqual(stored?.messages.at(-1)?.toolCalls, []);
});

test("a spend-capped SSE ask stores the question, skips the vendor, and does not rank", async () => {
  const analyst = "sse-cap@example.com";
  const opened = startThread(analyst, "Texas candidates?")!;
  const ip = "192.0.2.44";
  const day = Date.UTC(2026, 8, 1, 12);
  for (let n = 0; n < AGENT_ASKS_PER_EMAIL; n += 1) {
    assert.equal(reserveAgentCall({ email: analyst, clientIp: ip, at: day }), true);
  }

  let vendorCalls = 0;
  const response = await chatSseResponse(askRequest("And New England?", opened.id), {
    email: analyst,
    clientIp: ip,
    at: day,
    run: async () => {
      vendorCalls += 1;
      return { text: "must not run", toolCalls: [rankingCall] };
    },
  });

  const events = await readEvents(response);
  assert.equal(vendorCalls, 0);
  assert.equal(events.at(-1)?.type, "done");
  assert.ok(!events.some((event) => event.type === "tool"));

  const stored = readThread(analyst, opened.id);
  assert.equal(stored?.messages.at(-2)?.text, "And New England?");
  assert.equal(stored?.messages.at(-1)?.text, SPEND_CAP_REFUSAL);
  assert.deepEqual(stored?.messages.at(-1)?.toolCalls, []);
});

test("overlapping SSE asks on one thread keep each answer under its own question", async () => {
  const analyst = "sse-overlap@example.com";
  const opened = startThread(analyst, "Open.")!;
  let releaseFirst!: () => void;
  const firstHeld = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let secondStarted = false;

  const firstResponse = await chatSseResponse(askRequest("First?", opened.id), {
    email: analyst,
    clientIp: "203.0.113.10",
    run: async () => {
      await firstHeld;
      return { text: "answer one", toolCalls: [] };
    },
  });
  const firstBody = firstResponse.text();

  const secondResponse = await chatSseResponse(askRequest("Second?", opened.id), {
    email: analyst,
    clientIp: "203.0.113.10",
    run: async () => {
      secondStarted = true;
      return { text: "answer two", toolCalls: [] };
    },
  });
  const secondBody = secondResponse.text();

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(secondStarted, false);

  releaseFirst();
  await firstBody;
  await secondBody;

  assert.deepEqual(
    readThread(analyst, opened.id)?.messages.map((message) => message.text),
    ["Open.", "First?", "answer one", "Second?", "answer two"],
  );
});

test("a blank ask is not a stream and does not call the vendor", async () => {
  let vendorCalls = 0;
  const response = await chatSseResponse(askRequest("  \n "), {
    email: ANALYST,
    clientIp: "203.0.113.9",
    run: async () => {
      vendorCalls += 1;
      return { text: "nope", toolCalls: [] };
    },
  });

  assert.equal(response.status, 204);
  assert.equal(vendorCalls, 0);
  assert.doesNotMatch(response.headers.get("content-type") ?? "", /event-stream/);
});

test("the stored ranking is the complete queryAirports payload, not a streamed sentence", async () => {
  const analyst = "sse-rank@example.com";
  const opened = startThread(analyst, "BOS delay?")!;

  const response = await chatSseResponse(askRequest(QUESTION, opened.id), {
    email: analyst,
    clientIp: "203.0.113.9",
    run: async (_request, onEvent) => {
      onEvent?.({ type: "tool", call: rankingCall });
      onEvent?.({ type: "text", delta: "PVD leads at a number the table already has." });
      return { text: "PVD leads at a number the table already has.", toolCalls: [rankingCall] };
    },
  });

  const events = await readEvents(response);
  const stored = readThread(analyst, opened.id)!;
  const parts = threadAnswer(stored.messages, stored.messages.length - 1);

  assert.ok(parts.some((part) => part.tag === "inspect"));
  assert.ok(parts.some((part) => part.tag === "ranking"));
  const inspect = parts.find((part) => part.tag === "inspect");
  assert.ok(inspect && inspect.tag === "inspect");
  assert.equal(inspect.calls[0]?.tool, "queryAirports");
  assert.ok(inspect.sets.length > 0);
  assert.equal(
    events.every((event) => event.type === "question" || event.type === "tool" || event.type === "text" || event.type === "done"),
    true,
  );
  const ranking = parts.find((part) => part.tag === "ranking");
  assert.ok(ranking && ranking.tag === "ranking");
  assert.ok(ranking.rows.length > 0);
  assert.ok(ranking.rows[0]?.lamp);
});

test("the route is an authenticated POST SSE and does not import a vendor SDK", () => {
  assert.equal(CHAT_SSE_PATH, "/api/chat");
  const route = "./api/chat/route.ts";
  assert.ok(existsSync(new URL(route, import.meta.url)), route);

  const handler = source(route);
  assert.match(handler, /export async function POST/);
  assert.match(handler, /currentSession/);
  assert.match(handler, /chatSseResponse/);
  assert.match(handler, /clientIpFromHeaders/);
  assert.doesNotMatch(handler, /["']ai["']|@ai-sdk\/|from ["']ai\/|streamText/);

  const helper = source("./chat-sse.ts");
  assert.match(helper, /askOnThread\(/);
  assert.match(helper, /streamAgentModel/);
  assert.match(helper, /text\/event-stream/);
  assert.doesNotMatch(helper, /["']ai["']|@ai-sdk\/|from ["']ai\/|streamText/);
  assert.doesNotMatch(helper, /ranking-view|thread-answer|candidateLamp|WITHHELD_COMPOSITE/);
});

test("composer and pending follow the SSE ask until the stream ends", () => {
  const chat = source("../components/Chat.tsx");
  const form = chat.search(/<form[\s\S]*?action=\{askOnChatSse\}/);
  const pending = chat.indexOf("<PendingAnswer");
  const composer = chat.indexOf("<Composer");

  assert.ok(form > 0, "the form posts through the SSE ask");
  assert.ok(pending > form, "the pending answer is inside that form");
  assert.ok(composer > pending, "the pending row sits above the composer");
  assert.match(chat, /askOnChatSse/);
  assert.doesNotMatch(chat, /askQuestion|thread-actions/);
  assert.match(source("./chat-ask.ts"), /fetch\(CHAT_SSE_PATH/);
  assert.match(source("./chat-ask.ts"), /threadIdFromSse/);
  assert.doesNotMatch(chat, /EventSource|text\/event-stream/);
});

test("PRD Implementation Decisions and HTTP name the shipped SSE shell", () => {
  const prd = readFileSync(new URL("../../../PRD.md", import.meta.url), "utf8");
  const stack = prd.slice(prd.indexOf("### Stack"), prd.indexOf("### Surfaces"));
  const http = prd.slice(prd.indexOf("### HTTP"), prd.indexOf("### Chat UI"));

  assert.match(stack, /streamText/);
  assert.match(stack, /route handler/);
  assert.match(http, /POST/);
  assert.match(http, /\/api\/chat/);
  assert.match(http, /SSE/);
  assert.match(http, /streamText/);
  assert.doesNotMatch(http, /generateText|askQuestion|server action/i);
});

test("the generateText server-action ask path is gone", () => {
  assert.equal(existsSync(new URL("./thread-actions.ts", import.meta.url)), false);
  const chat = source("../components/Chat.tsx");
  assert.doesNotMatch(chat, /askQuestion/);
  assert.doesNotMatch(source("./chat-ask.ts"), /askQuestion|generateText|runAgentModel/);
});
