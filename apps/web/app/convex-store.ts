/**
 * Convex's two tables, and only those two: accounts and Threads. Airports,
 * scores, and the snapshot stay files/modules (PRD). A hosted deployment is
 * `CONVEX_URL`; until that points at a live project the same two documents
 * live in `.convex/` so a process restart does not drop them.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export const CONVEX_TABLES = ["accounts", "threads"] as const;

export type ConvexAccount = {
  email: string;
  passwordHash: string;
};

export type ConvexThread = {
  id: string;
  ownerEmail: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: unknown[];
};

export type ConvexDocuments = {
  accounts: Record<string, ConvexAccount>;
  threads: Record<string, ConvexThread>;
};

export type ConvexBackend = {
  getAccount(email: string): Promise<ConvexAccount | null>;
  putAccount(account: ConvexAccount): Promise<void>;
  getThread(threadId: string, ownerEmail: string): Promise<ConvexThread | null>;
  putThread(thread: ConvexThread): Promise<ConvexThread | null>;
  listThreadsByOwner(ownerEmail: string): Promise<ConvexThread[]>;
};

type ConvexHost = {
  __aiiConvexDocuments?: ConvexDocuments;
};

const accountsGet = makeFunctionReference<"query">("accounts:get");
const accountsPut = makeFunctionReference<"mutation">("accounts:put");
const threadsGet = makeFunctionReference<"query">("threads:get");
const threadsListByOwner = makeFunctionReference<"query">("threads:listByOwner");
const threadsPut = makeFunctionReference<"mutation">("threads:put");

let sharedBackend: ConvexBackend | null = null;

/** The hosted deployment a clone configures, when it has one. */
export function convexEnv(): { url: string; deployKey: string } {
  return {
    url: process.env.CONVEX_URL ?? "",
    deployKey: process.env.CONVEX_DEPLOY_KEY ?? "",
  };
}

/**
 * Tests inject a fake so CI can prove a write still reads after RAM and the
 * pid file are gone, without a live Convex project.
 */
export function useSharedConvexBackend(backend: ConvexBackend | null): void {
  sharedBackend = backend;
}

function host(): ConvexHost {
  return globalThis as unknown as ConvexHost;
}

function emptyDocuments(): ConvexDocuments {
  return { accounts: {}, threads: {} };
}

function convexDir(): string {
  return join(process.cwd(), ".convex");
}

function dataPath(): string {
  // Pid in the name so parallel test files in this cwd do not share a JSON file.
  return join(convexDir(), `auth-and-threads-${process.pid}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function accountDocument(account: ConvexAccount): ConvexAccount {
  return { email: account.email, passwordHash: account.passwordHash };
}

function threadDocument(thread: ConvexThread): ConvexThread {
  return {
    id: thread.id,
    ownerEmail: thread.ownerEmail,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: thread.messages,
  };
}

/** Copies a table through `toDocument` so extra keys cannot ride along. */
function tableDocuments<T>(
  value: unknown,
  toDocument: (row: T) => T,
): Record<string, T> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, row]) => [key, toDocument(row as T)]),
  );
}

function parseDocuments(value: unknown): ConvexDocuments {
  if (!isRecord(value)) {
    return emptyDocuments();
  }
  return {
    accounts: tableDocuments(value.accounts, accountDocument),
    threads: tableDocuments(value.threads, threadDocument),
  };
}

function loadFromDisk(): ConvexDocuments {
  try {
    return parseDocuments(JSON.parse(readFileSync(dataPath(), "utf8")));
  } catch {
    return emptyDocuments();
  }
}

/** What the Convex database holds: the two tables, no others. */
export function convexDocuments(): ConvexDocuments {
  const state = host();
  state.__aiiConvexDocuments ??= loadFromDisk();
  return state.__aiiConvexDocuments;
}

export function convexAccountMap(): Record<string, ConvexAccount> {
  return convexDocuments().accounts;
}

export function convexThreadMap(): Record<string, ConvexThread> {
  return convexDocuments().threads;
}

function hostedConvexUrl(): string {
  // node --test sets NODE_TEST_CONTEXT; never hit a developer's live project.
  if (process.env.NODE_TEST_CONTEXT) {
    return "";
  }
  return convexEnv().url;
}

function convexHttp(): ConvexHttpClient {
  return new ConvexHttpClient(hostedConvexUrl(), { logger: false });
}

function parsedAccount(value: unknown): ConvexAccount | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.email !== "string" || typeof value.passwordHash !== "string") {
    return null;
  }
  return accountDocument({ email: value.email, passwordHash: value.passwordHash });
}

function parsedThread(value: unknown): ConvexThread | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.ownerEmail !== "string" ||
    typeof value.title !== "string" ||
    typeof value.createdAt !== "number" ||
    typeof value.updatedAt !== "number" ||
    !Array.isArray(value.messages)
  ) {
    return null;
  }
  return threadDocument({
    id: value.id,
    ownerEmail: value.ownerEmail,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messages: value.messages,
  });
}

const fileBackend: ConvexBackend = {
  async getAccount(email) {
    return convexAccountMap()[email] ?? null;
  },
  async putAccount(account) {
    convexAccountMap()[account.email] = accountDocument(account);
    persistConvexStore();
  },
  async getThread(threadId, ownerEmail) {
    const thread = convexThreadMap()[threadId];
    return thread && thread.ownerEmail === ownerEmail ? thread : null;
  },
  async putThread(thread) {
    const threads = convexThreadMap();
    delete threads[thread.id];
    const stored = threadDocument({
      ...thread,
      messages: structuredClone(thread.messages),
    });
    threads[thread.id] = stored;
    persistConvexStore();
    return stored;
  },
  async listThreadsByOwner(ownerEmail) {
    return Object.values(convexThreadMap())
      .filter((thread) => thread.ownerEmail === ownerEmail)
      .reverse();
  },
};

const httpBackend: ConvexBackend = {
  async getAccount(email) {
    return parsedAccount(await convexHttp().query(accountsGet, { email }));
  },
  async putAccount(account) {
    await convexHttp().mutation(
      accountsPut,
      { email: account.email, passwordHash: account.passwordHash },
      { skipQueue: true },
    );
  },
  async getThread(threadId, ownerEmail) {
    return parsedThread(await convexHttp().query(threadsGet, { threadId, ownerEmail }));
  },
  async putThread(thread) {
    const stored = await convexHttp().mutation(
      threadsPut,
      {
        threadId: thread.id,
        ownerEmail: thread.ownerEmail,
        title: thread.title,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        messages: thread.messages,
      },
      { skipQueue: true },
    );
    return parsedThread(stored);
  },
  async listThreadsByOwner(ownerEmail) {
    const rows = await convexHttp().query(threadsListByOwner, { ownerEmail });
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.flatMap((row) => {
      const thread = parsedThread(row);
      return thread ? [thread] : [];
    });
  },
};

function backend(): ConvexBackend {
  if (sharedBackend) {
    return sharedBackend;
  }
  return hostedConvexUrl() ? httpBackend : fileBackend;
}

export async function getAccount(email: string): Promise<ConvexAccount | null> {
  return backend().getAccount(email);
}

export async function putAccount(account: ConvexAccount): Promise<void> {
  await backend().putAccount(account);
}

export async function getThread(
  threadId: string,
  ownerEmail: string,
): Promise<ConvexThread | null> {
  return backend().getThread(threadId, ownerEmail);
}

/**
 * Inserts the Thread last so recents order is object insertion order (last
 * spoken in last, first after reverse). Extra keys on the argument are dropped.
 */
export async function putThread(thread: ConvexThread): Promise<ConvexThread | null> {
  return backend().putThread(thread);
}

export async function listThreadsByOwner(ownerEmail: string): Promise<ConvexThread[]> {
  return backend().listThreadsByOwner(ownerEmail);
}

/**
 * Writes the two tables and nothing else. Extra keys a caller stuck on the
 * in-memory object are dropped, so an airport row cannot land in Convex by
 * riding along with a thread write.
 */
export function persistConvexStore(): void {
  const { accounts, threads } = convexDocuments();
  const payload: ConvexDocuments = {
    accounts: tableDocuments(accounts, accountDocument),
    threads: tableDocuments(threads, threadDocument),
  };
  mkdirSync(convexDir(), { recursive: true });
  const target = dataPath();
  const staging = `${target}.${process.pid}.tmp`;
  writeFileSync(staging, JSON.stringify(payload));
  renameSync(staging, target);
}

/** RAM is gone; the next read is from disk, as after a process restart. */
export function reloadConvexStore(): void {
  delete host().__aiiConvexDocuments;
}

/** RAM and the pid file are gone, as on a different Vercel isolate. */
export function dropLocalConvexReplica(): void {
  reloadConvexStore();
  try {
    unlinkSync(dataPath());
  } catch {
    // No replica on disk yet.
  }
}
