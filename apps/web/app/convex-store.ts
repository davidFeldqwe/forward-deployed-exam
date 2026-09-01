/**
 * Convex's two tables, and only those two: accounts and Threads. Airports,
 * scores, and the snapshot stay files/modules (PRD). A hosted deployment is
 * `CONVEX_URL` / `CONVEX_DEPLOY_KEY`; until those point at a live project the
 * same two documents live in `.convex/` so a process restart does not drop them.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

type ConvexHost = {
  __aiiConvexDocuments?: ConvexDocuments;
};

/** The hosted deployment a clone configures, when it has one. */
export function convexEnv(): { url: string; deployKey: string } {
  return {
    url: process.env.CONVEX_URL ?? "",
    deployKey: process.env.CONVEX_DEPLOY_KEY ?? "",
  };
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

export async function getAccount(email: string): Promise<ConvexAccount | null> {
  return convexAccountMap()[email] ?? null;
}

export async function putAccount(account: ConvexAccount): Promise<void> {
  convexAccountMap()[account.email] = accountDocument(account);
  persistConvexStore();
}

export async function getThread(
  threadId: string,
  ownerEmail: string,
): Promise<ConvexThread | null> {
  const thread = convexThreadMap()[threadId];
  return thread && thread.ownerEmail === ownerEmail ? thread : null;
}

/**
 * Inserts the Thread last so recents order is object insertion order (last
 * spoken in last, first after reverse). Extra keys on the argument are dropped.
 */
export async function putThread(thread: ConvexThread): Promise<ConvexThread> {
  const threads = convexThreadMap();
  delete threads[thread.id];
  const stored = threadDocument({
    ...thread,
    messages: structuredClone(thread.messages),
  });
  threads[thread.id] = stored;
  persistConvexStore();
  return stored;
}

export async function listThreadsByOwner(ownerEmail: string): Promise<ConvexThread[]> {
  return Object.values(convexThreadMap())
    .filter((thread) => thread.ownerEmail === ownerEmail)
    .reverse();
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

// Hosted Convex is configured through convexEnv(); the local file is the same
// two tables when CONVEX_URL is unset. Reading the env here keeps the names in
// this module so the README table cannot document a variable nothing reads.
void convexEnv();
