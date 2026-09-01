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

function dataPath(): string {
  // Pid in the name so parallel test files in this cwd do not share a JSON file.
  return join(process.cwd(), ".convex", `auth-and-threads-${process.pid}.json`);
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

function parseDocuments(value: unknown): ConvexDocuments {
  const docs = emptyDocuments();
  if (typeof value !== "object" || value === null) {
    return docs;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.accounts === "object" && record.accounts !== null) {
    for (const [email, account] of Object.entries(record.accounts as Record<string, ConvexAccount>)) {
      docs.accounts[email] = accountDocument(account);
    }
  }
  if (typeof record.threads === "object" && record.threads !== null) {
    for (const [id, thread] of Object.entries(record.threads as Record<string, ConvexThread>)) {
      docs.threads[id] = threadDocument(thread);
    }
  }
  return docs;
}

function loadFromDisk(): ConvexDocuments {
  try {
    return parseDocuments(JSON.parse(readFileSync(dataPath(), "utf8")));
  } catch {
    return emptyDocuments();
  }
}

function documents(): ConvexDocuments {
  const state = host();
  state.__aiiConvexDocuments ??= loadFromDisk();
  return state.__aiiConvexDocuments;
}

/** What the Convex database holds: the two tables, no others. */
export function convexDocuments(): ConvexDocuments {
  return documents();
}

export function convexAccountMap(): Record<string, ConvexAccount> {
  return documents().accounts;
}

export function convexThreadMap(): Record<string, ConvexThread> {
  return documents().threads;
}

/**
 * Writes the two tables and nothing else. Extra keys a caller stuck on the
 * in-memory object are dropped, so an airport row cannot land in Convex by
 * riding along with a thread write.
 */
export function persistConvexStore(): void {
  const { accounts, threads } = documents();
  const payload: ConvexDocuments = {
    accounts: Object.fromEntries(
      Object.entries(accounts).map(([email, account]) => [email, accountDocument(account)]),
    ),
    threads: Object.fromEntries(
      Object.entries(threads).map(([id, thread]) => [id, threadDocument(thread)]),
    ),
  };
  const directory = join(process.cwd(), ".convex");
  mkdirSync(directory, { recursive: true });
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
