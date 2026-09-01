/**
 * Budget for authenticated asks that would call the vendor model. Open signup
 * stays invite-free; this is the lid on the bill. The check lives on the shared
 * ask seam (`askOnThread`) so a later SSE `POST` cannot go around it.
 *
 * Three lids, all UTC-day windows: one account, one coarse network, and the
 * deployment as a whole. Hitting any of them stores the question and answers
 * with the locked line below — no vendor call, no ranking, no pretend scores.
 */
import { normalizeEmail } from "./auth-accounts.ts";

/** Per signed-in email, enough for a reviewer to try the sample questions. */
export const AGENT_ASKS_PER_EMAIL = 10;

/**
 * Coarse per-IP lid. Wider than the per-email lid so a shared NAT (an office,
 * a demo hall) is not one account's budget, but still stops minting accounts
 * from one address.
 */
export const AGENT_ASKS_PER_IP = 40;

/** Ceiling on vendor calls this process will make in a UTC day. */
export const AGENT_ASKS_PER_DAY = 250;

/** What the thread shows when an ask is stored but the vendor is not called. */
export const SPEND_CAP_REFUSAL =
  "The daily agent-call limit for this account or network has been reached, so the question is " +
  "stored but unanswered. There is no ranking and no score — the capacity-pressure screen did " +
  "not run. Try again tomorrow.";

/** Shared bucket when the client address is missing or not an IP. */
const UNKNOWN_NETWORK = "unknown";

export type AgentCall = {
  email: string;
  clientIp: string;
  /** Milliseconds since epoch; omitted means now. */
  at?: number;
};

type SpendStamp = {
  at: number;
  email: string;
  ip: string;
};

type SpendHost = {
  __aiiAgentSpend?: SpendStamp[];
};

/**
 * The ledger hangs off `globalThis` for the same reason the thread store does:
 * Next bundles the page graph and the server-action graph separately, so a
 * module-level array would give the composer action and a later SSE route a
 * budget each — which is no lid at all.
 */
function spendHost(): SpendHost {
  return globalThis as unknown as SpendHost;
}

function spendStamps(): SpendStamp[] {
  const host = spendHost();
  host.__aiiAgentSpend ??= [];
  return host.__aiiAgentSpend;
}

/** UTC calendar day, so a limit is not a rolling hour that a clock can slide. */
function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function stampsOn(day: string): SpendStamp[] {
  return spendStamps().filter((stamp) => utcDay(stamp.at) === day);
}

/** First four hextets, zero-stripped — an IPv6 /64, not a per-interface id. */
function ipv6Slash64(address: string): string | null {
  const groups = address.split(":").filter((group) => group.length > 0);
  if (groups.length === 0) {
    return null;
  }
  return groups
    .slice(0, 4)
    .map((group) => {
      const value = Number.parseInt(group, 16);
      return Number.isFinite(value) ? value.toString(16) : group.toLowerCase();
    })
    .join(":");
}

/**
 * The network bucket an ask counts against. IPv4 stays the address; IPv6 is
 * the /64 (first four hextets); a missing or unparseable value shares one
 * `unknown` bucket so omitting a header is not a way around the lid.
 */
export function coarseClientIp(raw: string): string {
  const first = raw.split(",")[0]?.trim() ?? "";
  if (first.length === 0) {
    return UNKNOWN_NETWORK;
  }
  const mappedV4 = first.replace(/^::ffff:/i, "");
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mappedV4)) {
    return mappedV4;
  }
  if (!first.includes(":")) {
    return UNKNOWN_NETWORK;
  }
  return ipv6Slash64(first) ?? UNKNOWN_NETWORK;
}

/** The left-most forwarded hop, then `X-Real-IP`, else the unknown bucket. */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  return coarseClientIp(headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "");
}

/**
 * True when this ask may call the vendor. A true result spends one slot; a
 * false one spends nothing, so a refused ask can be retried tomorrow without
 * having used the next day's budget.
 */
export function reserveAgentCall({ email, clientIp, at = Date.now() }: AgentCall): boolean {
  const day = utcDay(at);
  const ip = coarseClientIp(clientIp);
  const owner = normalizeEmail(email);
  const today = stampsOn(day);
  if (today.length >= AGENT_ASKS_PER_DAY) {
    return false;
  }
  if (today.filter((stamp) => stamp.email === owner).length >= AGENT_ASKS_PER_EMAIL) {
    return false;
  }
  if (today.filter((stamp) => stamp.ip === ip).length >= AGENT_ASKS_PER_IP) {
    return false;
  }
  spendStamps().push({ at, email: owner, ip });
  return true;
}

/** Test isolation: this process's ledger is otherwise the day's running total. */
export function resetAgentSpend(): void {
  spendHost().__aiiAgentSpend = [];
}
