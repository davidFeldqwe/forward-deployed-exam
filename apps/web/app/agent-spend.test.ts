import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import {
  AGENT_ASKS_PER_DAY,
  AGENT_ASKS_PER_EMAIL,
  AGENT_ASKS_PER_IP,
  SPEND_CAP_REFUSAL,
  clientIpFromHeaders,
  coarseClientIp,
  resetAgentSpend,
  reserveAgentCall,
} from "./agent-spend.ts";
import { threadAnswer } from "./thread-answer.ts";
import { assistantMessage, userMessage } from "./thread-messages.ts";
import { askOnThread, readThread, startThread } from "./thread-store.ts";

afterEach(() => {
  resetAgentSpend();
});

test("the spend-cap refusal is a locked line with no ranking and no pretend scores", () => {
  assert.match(SPEND_CAP_REFUSAL, /question is stored/i);
  assert.match(SPEND_CAP_REFUSAL, /no ranking/i);
  assert.doesNotMatch(SPEND_CAP_REFUSAL, /\d/);
  assert.doesNotMatch(SPEND_CAP_REFUSAL, /composite|candidate lamp|percentile/i);

  const messages = [
    userMessage("Which airports in New England are candidates?"),
    assistantMessage(SPEND_CAP_REFUSAL),
  ];
  const parts = threadAnswer(messages, 1);

  assert.deepEqual(
    parts.map((part) => part.tag),
    ["prose"],
  );
  assert.equal(parts.find((part) => part.tag === "prose")?.text, SPEND_CAP_REFUSAL);
});

test("one account is allowed a day's worth of vendor calls, then refused", () => {
  const email = "reviewer@example.com";
  const ip = "203.0.113.10";
  const day = Date.UTC(2026, 8, 1, 12);

  for (let n = 0; n < AGENT_ASKS_PER_EMAIL; n += 1) {
    assert.equal(reserveAgentCall({ email, clientIp: ip, at: day }), true, `call ${n + 1}`);
  }
  assert.equal(reserveAgentCall({ email, clientIp: ip, at: day }), false);
  // A different account on another network still has budget.
  assert.equal(
    reserveAgentCall({ email: "other@example.com", clientIp: "203.0.113.11", at: day }),
    true,
  );
  // The same account is free again on the next UTC day.
  assert.equal(
    reserveAgentCall({ email, clientIp: ip, at: day + 24 * 60 * 60 * 1000 }),
    true,
  );
});

test("one coarse IP is capped even across many signed-up emails", () => {
  const ip = "198.51.100.4";
  const day = Date.UTC(2026, 8, 1, 15);

  for (let n = 0; n < AGENT_ASKS_PER_IP; n += 1) {
    assert.equal(
      reserveAgentCall({ email: `n${n}@example.com`, clientIp: ip, at: day }),
      true,
      `call ${n + 1}`,
    );
  }
  assert.equal(reserveAgentCall({ email: "last@example.com", clientIp: ip, at: day }), false);
  assert.equal(
    reserveAgentCall({ email: "elsewhere@example.com", clientIp: "198.51.100.5", at: day }),
    true,
  );
});

test("a daily ceiling covers the whole deployment, not one account", () => {
  const day = Date.UTC(2026, 8, 1, 8);

  for (let n = 0; n < AGENT_ASKS_PER_DAY; n += 1) {
    assert.equal(
      reserveAgentCall({
        email: `n${n}@example.com`,
        clientIp: `203.0.113.${(n % 200) + 1}`,
        at: day,
      }),
      true,
    );
  }
  assert.equal(
    reserveAgentCall({ email: "overflow@example.com", clientIp: "192.0.2.1", at: day }),
    false,
  );
});

test("x-forwarded-for is coarsened so one NAT cannot mint a fresh bucket per hop", () => {
  assert.equal(coarseClientIp("203.0.113.9, 10.0.0.1"), "203.0.113.9");
  assert.equal(coarseClientIp("  ::ffff:198.51.100.7  "), "198.51.100.7");
  assert.equal(coarseClientIp("2001:db8:abcd:0012:ffff:0:0:1"), "2001:db8:abcd:12");
  assert.equal(coarseClientIp(""), "unknown");
  assert.equal(
    clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })),
    "203.0.113.9",
  );
  assert.equal(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  assert.equal(clientIpFromHeaders(new Headers()), "unknown");
});

test("a capped ask stores the question, skips the vendor, and answers with the locked line", async () => {
  const analyst = "capped@example.com";
  const ip = "192.0.2.44";
  const opened = startThread(analyst, "Which airports in Texas are candidates?")!;
  const day = Date.UTC(2026, 8, 1, 12);

  for (let n = 0; n < AGENT_ASKS_PER_EMAIL; n += 1) {
    assert.equal(reserveAgentCall({ email: analyst, clientIp: ip, at: day }), true);
  }

  let vendorCalls = 0;
  const thread = await askOnThread(
    analyst,
    opened.id,
    "And New England?",
    async () => {
      vendorCalls += 1;
      return assistantMessage("this ranking must not be stored");
    },
    ip,
    day,
  );

  assert.equal(vendorCalls, 0);
  assert.equal(thread?.messages.at(-2)?.text, "And New England?");
  assert.equal(thread?.messages.at(-1)?.text, SPEND_CAP_REFUSAL);
  assert.deepEqual(thread?.messages.at(-1)?.toolCalls, []);
  assert.deepEqual(readThread(analyst, opened.id)?.messages, thread?.messages);
});

test("repeated asks on one account eventually refuse instead of calling the vendor again", async () => {
  const analyst = "repeat@example.com";
  const ip = "192.0.2.80";
  const day = Date.UTC(2026, 8, 1, 18);
  let vendorCalls = 0;
  const answer = async () => {
    vendorCalls += 1;
    return assistantMessage("a ranked answer");
  };

  let threadId: string | null = null;
  for (let n = 0; n < AGENT_ASKS_PER_EMAIL; n += 1) {
    const thread = await askOnThread(analyst, threadId, `Question ${n + 1}?`, answer, ip, day);
    threadId = thread?.id ?? null;
    assert.equal(thread?.messages.at(-1)?.text, "a ranked answer");
  }

  const capped = await askOnThread(analyst, threadId, "One more?", answer, ip, day);

  assert.equal(vendorCalls, AGENT_ASKS_PER_EMAIL);
  assert.equal(capped?.messages.at(-2)?.text, "One more?");
  assert.equal(capped?.messages.at(-1)?.text, SPEND_CAP_REFUSAL);
  assert.deepEqual(capped?.messages.at(-1)?.toolCalls, []);
});

test("the SSE ask budgets through the ask seam, with the request's IP", () => {
  const route = readFileSync(new URL("./api/chat/route.ts", import.meta.url), "utf8");
  const helper = readFileSync(new URL("./chat-sse.ts", import.meta.url), "utf8");

  assert.match(route, /clientIpFromHeaders\(request\.headers\)/);
  assert.match(helper, /askOnThread\(/);
  assert.match(helper, /streamAgentModel/);
  assert.doesNotMatch(helper, /runAgentModel|generateText/);
  assert.doesNotMatch(route, /runAgentModel|generateText|askQuestion/);
});
