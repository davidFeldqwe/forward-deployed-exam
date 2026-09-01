/**
 * The code/LLM boundary for one assistant turn: every IATA in prose is in that
 * turn's `resolvedIata`, and every composite / percentile / delay / growth
 * figure comes from `rows`. Ordinary tests pin this on fixtures; the local
 * Evalite loop grades live `answerQuestion` turns with the same checkers.
 */
import { COMPONENTS, type ScoredAirport } from "@repo/scoring";

import { ACCEPTED_PLACE_PHRASES, OFF_THESIS_REFUSAL, unknownPlaceRefusal } from "./refusals.ts";
import { rankingRows, type ThreadMessage, type ToolCall } from "./thread-messages.ts";

const NEW_ENGLAND = "new england";

/** Signed integer or decimal as the agent writes it in prose. */
const NUMBER = String.raw`-?\d+(?:\.\d+)?`;
const COMPOSITE = String.raw`composite(?:\s+score)?\s*(?:of|at|is|:)?\s*(${NUMBER})`;

/** Three-letter tokens the agent writes that are not airport codes. */
const NOT_IATA = new Set([
  "THE",
  "AND",
  "FOR",
  "ARE",
  "BUT",
  "NOT",
  "YOU",
  "ALL",
  "CAN",
  "HER",
  "WAS",
  "ONE",
  "OUR",
  "OUT",
  "DAY",
  "GET",
  "HAS",
  "HIM",
  "HIS",
  "HOW",
  "ITS",
  "LET",
  "MAY",
  "NEW",
  "NOW",
  "OLD",
  "SEE",
  "TWO",
  "WAY",
  "WHO",
  "DID",
  "ANY",
  "FEW",
  "PER",
  "USE",
  "FAA",
  "BTS",
  "ROI",
  "CSV",
  "PDF",
  "API",
  "SDK",
  "LLM",
  "SSE",
  "PRD",
  "HHI",
  "USA",
  "USD",
  "XML",
  "DOM",
  "CSS",
  "NPM",
  "GIT",
  "URL",
]);

export type CitationVerdict = { ok: boolean; reason: string };

/** The ranking fields the checker reads; the rest of a query payload is unused. */
type RankingCitation = {
  rows: readonly ScoredAirport[];
  matched: number;
  resolvedIata: readonly string[];
  unknownPlace: readonly { field: string; value: string }[];
};

/**
 * Grade a New England candidates answer: `queryAirports` with that region and
 * `matched > 0`, `describeMethodology` optional, prose bound to that payload.
 */
export function checkNewEnglandRanking(answer: ThreadMessage): CitationVerdict {
  const query = lastQueryCall(answer.toolCalls);
  if (!query) {
    return fail("the turn never called queryAirports");
  }
  const region = typeof query.args.region === "string" ? query.args.region.trim() : "";
  if (region.toLowerCase() !== NEW_ENGLAND) {
    return fail(`queryAirports region must be New England, got ${JSON.stringify(query.args.region)}`);
  }
  const payload = queryPayload(query);
  if (!payload) {
    return fail("queryAirports did not return a ranking payload");
  }
  if (!(payload.matched > 0)) {
    return fail(`queryAirports matched ${payload.matched}, need more than 0`);
  }
  return checkCitations(answer.text, payload);
}

/**
 * Grade a Los Angeles vs Santa Ana congestion compare: one `queryAirports`
 * names both `LAX` and `SNA` (order irrelevant), as a two-code ranking or a
 * two-code congestion lookup. Municipality-only or a dropped code fails.
 */
export function checkCompareCongestion(answer: ThreadMessage): CitationVerdict {
  const query = lastQueryCall(answer.toolCalls);
  if (!query) {
    return fail("the turn never called queryAirports");
  }
  const codes = namedIata(query.args);
  if (!codes.includes("LAX") || !codes.includes("SNA")) {
    if (typeof query.args.municipality === "string" && query.args.municipality.trim() !== "") {
      return fail("a compare must name LAX and SNA, not a municipality");
    }
    const missing = [!codes.includes("LAX") ? "LAX" : null, !codes.includes("SNA") ? "SNA" : null]
      .filter((code): code is string => code !== null)
      .join(" and ");
    return fail(`queryAirports iata must name LAX and SNA, missing ${missing}`);
  }
  const payload = queryPayload(query);
  if (!payload) {
    return fail("queryAirports did not return a ranking payload");
  }
  const resolved = new Set(payload.resolvedIata);
  if (!resolved.has("LAX") || !resolved.has("SNA")) {
    return fail("queryAirports must resolve both LAX and SNA");
  }
  const metric = queryMetric(query);
  if (metric !== null && metric !== "congestion") {
    return fail(`compare congestion must be a ranking or a congestion lookup, got metric ${metric}`);
  }
  return checkCitations(answer.text, payload);
}

/**
 * Grade an off-thesis question: exact locked copy, and no tools at all.
 */
export function checkOffThesisRefusal(answer: ThreadMessage): CitationVerdict {
  if (answer.toolCalls.length > 0) {
    return fail("off-thesis refusal must call no tools");
  }
  if (!answer.text.includes(OFF_THESIS_REFUSAL)) {
    return fail("prose must contain the exact OFF_THESIS_REFUSAL copy");
  }
  return { ok: true, reason: "exact off-thesis refusal, no tools" };
}

/**
 * Grade a Paris ranking: the model must not geocode. Either no tools, accepted
 * place phrases, and a did-not-resolve / not-geocoded claim; or `queryAirports`
 * returns `unknownPlace` / empty rows and prose equals `unknownPlaceRefusal`
 * from that payload.
 */
export function checkParisRefusal(answer: ThreadMessage): CitationVerdict {
  const query = lastQueryCall(answer.toolCalls);
  if (!query) {
    if (answer.toolCalls.length > 0) {
      return fail("Paris no-tool path must call no tools");
    }
    return checkParisNoTool(answer.text);
  }
  const payload = queryPayload(query);
  if (!payload) {
    return fail("queryAirports did not return a ranking payload");
  }
  if (payload.unknownPlace.length === 0) {
    return fail("queryAirports must return unknownPlace");
  }
  if (payload.rows.length !== 0 || payload.matched !== 0) {
    return fail("unknown-place Paris must return empty rows");
  }
  const citations = checkCitations(answer.text, payload);
  if (!citations.ok) {
    return citations;
  }
  const expected = unknownPlaceRefusal([...payload.unknownPlace]);
  if (expected === null || answer.text.trim() !== expected) {
    return fail("prose must equal unknownPlaceRefusal from this payload");
  }
  return { ok: true, reason: "unknownPlace refusal matches the payload" };
}

function checkParisNoTool(prose: string): CitationVerdict {
  for (const phrase of ACCEPTED_PLACE_PHRASES) {
    if (!prose.includes(phrase)) {
      return fail(`no-tool Paris refusal must name accepted phrases, missing ${phrase}`);
    }
  }
  if (!/did not resolve|does not resolve|not resolve|unresolv/i.test(prose)) {
    return fail("no-tool Paris refusal must say the phrase did not resolve");
  }
  if (!/not geocoded|never geocoded|did not geocode|was not geocoded/i.test(prose)) {
    return fail("no-tool Paris refusal must say the phrase was not geocoded");
  }
  const invented = citedIata(stripAcceptedPhrases(prose));
  if (invented[0] !== undefined) {
    return fail(`prose names ${invented[0]}, which is not in this turn's resolvedIata`);
  }
  return { ok: true, reason: "no-tool unknown-place refusal" };
}

/**
 * Every IATA in prose is in `resolvedIata`. Every composite / percentile /
 * delay / growth figure in prose comes from `rows`. An off-page resolved code
 * may be named; a composite attached to it is invented unless that number is
 * that airport's own page row — which it does not have.
 */
export function checkCitations(prose: string, payload: RankingCitation): CitationVerdict {
  const resolved = new Set(payload.resolvedIata);
  const onPage = new Map(payload.rows.map((row) => [row.iata, row]));
  const allowed = allowedFigures(payload.rows);
  const cited = stripAcceptedPhrases(prose);

  for (const code of citedIata(cited)) {
    if (!resolved.has(code)) {
      return fail(`prose names ${code}, which is not in this turn's resolvedIata`);
    }
  }

  for (const figure of citedFigures(cited)) {
    const problem = figureProblem(figure, resolved, onPage, allowed);
    if (problem !== null) {
      return fail(problem);
    }
  }

  return { ok: true, reason: "prose cites only this turn's payload" };
}

function fail(reason: string): CitationVerdict {
  return { ok: false, reason };
}

function stripAcceptedPhrases(prose: string): string {
  let stripped = prose;
  for (const phrase of ACCEPTED_PLACE_PHRASES) {
    stripped = stripped.split(phrase).join("");
  }
  return stripped;
}

function lastQueryCall(calls: readonly ToolCall[]): ToolCall | null {
  const queries = calls.filter((call) => call.tool === "queryAirports");
  return queries[queries.length - 1] ?? null;
}

function queryPayload(call: ToolCall): RankingCitation | null {
  const rows = rankingRows(call);
  if (!rows || !isRecord(call.result)) {
    return null;
  }
  const { matched, resolvedIata } = call.result;
  if (typeof matched !== "number" || !Array.isArray(resolvedIata)) {
    return null;
  }
  if (!resolvedIata.every((code): code is string => typeof code === "string")) {
    return null;
  }
  return { rows, matched, resolvedIata, unknownPlace: unknownPlacesOf(call.result) };
}

function namedIata(args: ToolCall["args"]): string[] {
  const raw = args.iata;
  const parts = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  const codes: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const code = part.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) {
      codes.push(code);
    }
  }
  return codes;
}

function queryMetric(call: ToolCall): string | null {
  if (!isRecord(call.result)) {
    return null;
  }
  return typeof call.result.metric === "string" ? call.result.metric : null;
}

function unknownPlacesOf(result: Record<string, unknown>): { field: string; value: string }[] {
  const raw = result.unknownPlace;
  if (!Array.isArray(raw)) {
    return [];
  }
  const places: { field: string; value: string }[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.field !== "string" || typeof item.value !== "string") {
      continue;
    }
    places.push({ field: item.field, value: item.value });
  }
  return places;
}

function citedIata(prose: string): string[] {
  const found = new Set<string>();
  for (const match of prose.matchAll(/\b[A-Z]{3}\b/g)) {
    const code = match[0];
    if (!NOT_IATA.has(code)) {
      found.add(code);
    }
  }
  return [...found];
}

type CitedFigure = {
  kind: "composite" | "percentile" | "delay" | "growth";
  value: number;
  iata: string | null;
};

function citedFigures(prose: string): CitedFigure[] {
  const figures: CitedFigure[] = [];
  const push = (kind: CitedFigure["kind"], value: string, iata: string | null) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      figures.push({ kind, value: parsed, iata: iataIfCode(iata) });
    }
  };

  for (const match of prose.matchAll(new RegExp(String.raw`\b([A-Z]{3})\b[^.]{0,80}?\b${COMPOSITE}`, "gi"))) {
    push("composite", match[2] ?? "", match[1] ?? null);
  }
  for (const match of prose.matchAll(new RegExp(String.raw`\b${COMPOSITE}`, "gi"))) {
    const value = match[1] ?? "";
    if (!figures.some((figure) => figure.kind === "composite" && figure.value === Number(value))) {
      push("composite", value, null);
    }
  }

  const scans: Array<{ kind: CitedFigure["kind"]; pattern: string }> = [
    { kind: "percentile", pattern: String.raw`(${NUMBER})\s*(?:st|nd|rd|th)?\s*(?:percentile|pctl)\b` },
    { kind: "delay", pattern: String.raw`(${NUMBER})\s*(?:min(?:ute)?s?)\b` },
    { kind: "growth", pattern: String.raw`\bgrowth\b[^%]{0,40}?(${NUMBER})\s*%` },
    { kind: "growth", pattern: String.raw`(${NUMBER})\s*%[^.]{0,20}\bgrowth\b` },
  ];
  for (const { kind, pattern } of scans) {
    for (const match of prose.matchAll(new RegExp(pattern, "gi"))) {
      push(kind, match[1] ?? "", null);
    }
  }
  return figures;
}

function iataIfCode(value: string | null): string | null {
  if (value === null) return null;
  const code = value.toUpperCase();
  return NOT_IATA.has(code) ? null : code;
}

function figureProblem(
  figure: CitedFigure,
  resolved: ReadonlySet<string>,
  onPage: ReadonlyMap<string, ScoredAirport>,
  allowed: ReadonlySet<string>,
): string | null {
  const code = figure.iata;
  if (code !== null && resolved.has(code) && !onPage.has(code)) {
    return `${code} is in the resolved set but not on the page, so a ${figure.kind} attached to it is invented`;
  }
  if (code !== null && onPage.has(code)) {
    const row = onPage.get(code);
    if (row && !rowAllows(row, figure)) {
      return `${figure.kind} ${figure.value} is not a ${code} figure from this page`;
    }
    return null;
  }
  if (!allowed.has(normalizeFigure(figure.value))) {
    return `${figure.kind} ${figure.value} does not appear on this turn's rows`;
  }
  return null;
}

function allowedFigures(rows: readonly ScoredAirport[]): Set<string> {
  return new Set(rows.flatMap((row) => rowFigures(row).map(normalizeFigure)));
}

function rowFigures(row: ScoredAirport): number[] {
  const values: number[] = [];
  const add = (value: number | null) => {
    if (value !== null && Number.isFinite(value)) {
      values.push(value);
    }
  };
  add(row.composite);
  add(row.longHaulShare);
  for (const component of COMPONENTS) {
    add(row.scoreVector[component].percentile);
    add(row.scoreVector[component].raw);
  }
  return values;
}

function rowAllows(row: ScoredAirport, figure: CitedFigure): boolean {
  const needle = normalizeFigure(figure.value);
  if (rowFigures(row).some((value) => normalizeFigure(value) === needle)) {
    return true;
  }
  if (figure.kind !== "growth") {
    return false;
  }
  // Prose often writes the stored 0–1 share or growth raw as a percent.
  return asPercent(row.longHaulShare) === needle || asPercent(row.scoreVector.growth.raw) === needle;
}

function asPercent(share: number | null): string | null {
  return share === null ? null : normalizeFigure(share * 100);
}

function normalizeFigure(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
