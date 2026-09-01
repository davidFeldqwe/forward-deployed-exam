import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accountExists,
  authenticate,
  createAccount,
  sessionIfAccountLive,
} from "./auth-accounts.ts";
import { signSessionToken } from "./auth-token.ts";
import {
  type ConvexAccount,
  type ConvexThread,
  CONVEX_TABLES,
  convexDocuments,
  convexThreadMap,
  dropLocalConvexReplica,
  persistConvexStore,
  reloadConvexStore,
  useSharedConvexBackend,
} from "./convex-store.ts";
import { assistantMessage, userMessage } from "./thread-messages.ts";
import { appendMessage, askOnThread, listThreads, readThread, startThread } from "./thread-store.ts";

const NEW_ENGLAND = "Which airports in New England are renovation-investment candidates?";

/** A hosted Convex stand-in: writes live outside this process's RAM and pid file. */
function memoryConvexBackend() {
  const accounts: Record<string, ConvexAccount> = {};
  const threads: Record<string, ConvexThread> = {};
  return {
    async getAccount(email: string) {
      return accounts[email] ?? null;
    },
    async putAccount(account: ConvexAccount) {
      accounts[account.email] = { email: account.email, passwordHash: account.passwordHash };
    },
    async getThread(threadId: string, ownerEmail: string) {
      const thread = threads[threadId];
      return thread && thread.ownerEmail === ownerEmail ? thread : null;
    },
    async putThread(thread: ConvexThread) {
      const existing = threads[thread.id];
      if (existing && existing.ownerEmail !== thread.ownerEmail) {
        return null;
      }
      delete threads[thread.id];
      const stored: ConvexThread = {
        id: thread.id,
        ownerEmail: thread.ownerEmail,
        title: thread.title,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        messages: structuredClone(thread.messages),
      };
      threads[thread.id] = stored;
      return stored;
    },
    async listThreadsByOwner(ownerEmail: string) {
      return Object.values(threads)
        .filter((thread) => thread.ownerEmail === ownerEmail)
        .reverse();
    },
  };
}

const methodology = {
  tool: "describeMethodology" as const,
  args: {},
  result: { weights: { congestion: 35, unmetFlightDemand: 35, delay: 20, growth: 10 } },
  durationMs: 4,
};

test("a thread written through the shared backend survives emptying RAM and the local file", async () => {
  useSharedConvexBackend(memoryConvexBackend());
  try {
    const analyst = "vercel-isolate@example.com";
    const opened = await startThread(analyst, NEW_ENGLAND);

    dropLocalConvexReplica();

    const reread = await readThread(analyst, opened!.id);
    assert.equal(reread?.title, NEW_ENGLAND);
    assert.deepEqual(reread?.messages, [userMessage(NEW_ENGLAND)]);
  } finally {
    useSharedConvexBackend(null);
  }
});

test("a Thread and its stored tool payloads survive a process restart", async () => {
  const analyst = "restart-thread@example.com";
  const opened = (await startThread(analyst, NEW_ENGLAND))!;
  await appendMessage(analyst, opened.id, assistantMessage("Weights are fixed.", [methodology]));

  reloadConvexStore();

  const reread = await readThread(analyst, opened.id);
  assert.equal(reread?.title, NEW_ENGLAND);
  assert.deepEqual(reread?.messages, [
    userMessage(NEW_ENGLAND),
    assistantMessage("Weights are fixed.", [methodology]),
  ]);
});

test("an account survives a restart, and a signed-in cookie still maps to it", async () => {
  const analyst = "restart-account@example.com";
  const password = "correct horse battery";
  assert.deepEqual(await createAccount(analyst, password), { ok: true, email: analyst });
  const token = signSessionToken(analyst, "restart-secret");

  reloadConvexStore();

  assert.deepEqual(await authenticate(analyst, password), { ok: true, email: analyst });
  assert.equal(await accountExists(analyst), true);
  assert.deepEqual(await sessionIfAccountLive(token, "restart-secret"), { email: analyst });
});

test("Convex documents are accounts and threads only: never airports or scores", async () => {
  const analyst = "convex-scope@example.com";
  await startThread(analyst, NEW_ENGLAND);

  const tables = Object.keys(convexDocuments()).toSorted();
  assert.deepEqual(tables, [...CONVEX_TABLES].toSorted());
  assert.equal(tables.includes("airports"), false);
  assert.equal(tables.includes("scores"), false);
  assert.equal(tables.includes("snapshot"), false);
});

test("a persist drops airports and scores even if a caller stuck them on the store", async () => {
  const docs = convexDocuments() as Record<string, unknown>;
  docs.airports = [{ iata: "BOS" }];
  docs.scores = { BOS: 79 };
  docs.snapshot = { asOf: "never" };

  const opened = (await startThread("smuggle@example.com", NEW_ENGLAND))!;
  const thread = convexThreadMap()[opened.id] as Record<string, unknown>;
  thread.airports = [{ iata: "BOS", composite: 79 }];
  persistConvexStore();
  reloadConvexStore();

  assert.deepEqual(Object.keys(convexDocuments()).toSorted(), [...CONVEX_TABLES].toSorted());
  assert.equal("airports" in (convexThreadMap()[opened.id] ?? {}), false);
  assert.equal((await readThread("smuggle@example.com", opened.id))?.title, NEW_ENGLAND);
});

test("an SSE ask still stores one assistant message per question on the Convex Thread after a restart", async () => {
  const analyst = "sse-restart@example.com";
  const thread = await askOnThread(analyst, null, NEW_ENGLAND, async () =>
    assistantMessage("Weights are fixed.", [methodology]),
  );

  reloadConvexStore();

  const reread = await readThread(analyst, thread!.id);
  assert.deepEqual(
    reread?.messages.map((message) => message.role),
    ["user", "assistant"],
  );
  assert.equal(reread?.messages.filter((message) => message.role === "assistant").length, 1);
  assert.deepEqual(reread?.messages.at(-1)?.toolCalls, [
    assistantMessage("Weights are fixed.", [methodology]).toolCalls[0],
  ]);
});

test("recents order survives a restart: the thread last spoken in stays first", async () => {
  const analyst = "recents-restart@example.com";
  const first = (await startThread(analyst, NEW_ENGLAND))!;
  const second = (await startThread(analyst, "How much unmet flight demand is there at SFO?"))!;
  await appendMessage(analyst, first.id, assistantMessage("BOS leads at composite 79."));

  reloadConvexStore();

  assert.deepEqual(
    (await listThreads(analyst)).map((summary) => summary.id),
    [first.id, second.id],
  );
});
