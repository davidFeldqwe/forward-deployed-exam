/**
 * **Carried context** (CONTEXT.md; PRD story 29): how this thread resolved a
 * follow-up reference such as "the second one". It is read off the message list
 * — the thread's only record — and shown before the answer objects, so the
 * analyst sees which row the phrase became before they read a number for it.
 *
 * A carry is only claimed when the thread actually made one: the follow-up
 * filtered by codes, the question named no airport of its own, and those codes
 * are in a resolved airport set an earlier answer already showed. Anything
 * looser would put a guess under a heading that promises a resolution.
 */
import { PLACE_FIELDS } from "@repo/scoring";

import { rankingView } from "./ranking-view.ts";
import { indexOfPhrase } from "./text.ts";
import {
  previousQuestion,
  rankingRows,
  type JsonObject,
  type ThreadMessage,
} from "./thread-messages.ts";

/** One airport a reference resolved to, and where in the earlier set it sat. */
export type CarriedAirport = { iata: string; name: string; rank: number };

export type CarriedContext = {
  /** The analyst's own words, quoted rather than paraphrased. */
  phrase: string;
  /** The earlier answer's resolved place phrase, e.g. "New England". */
  from: string;
  airports: CarriedAirport[];
  /** One line naming the rows the phrase became, in the earlier set's order. */
  summary: string;
  note: string;
};

/**
 * The phrases that point at an earlier row rather than naming an airport. The
 * list is deliberately short and literal: this module reports what the thread
 * resolved, so a phrase it cannot name is better left without a block than
 * matched by a rule nobody can read.
 */
const REFERENCE_PATTERNS: readonly RegExp[] = [
  /\bthe (?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|top|bottom|same|other)(?: one| row| airport| two| three)?\b/i,
  /\b(?:that|this|those|these) (?:one|ones|two|three|row|rows|airport|airports)\b/i,
  /\b(?:it|its|them|they|their|those|these)\b/i,
];

export const CARRIED_CONTEXT_NOTE =
  "Resolved from the messages in this thread, not from a new place phrase and not from a guess.";

/**
 * How the answer at `index` resolved its follow-up reference, or null when it
 * did not resolve one.
 */
export function carriedContext(
  messages: readonly ThreadMessage[],
  index: number,
): CarriedContext | null {
  const answer = messages[index];
  if (!answer || answer.role !== "assistant") {
    return null;
  }
  const call = answer.toolCalls.find((candidate) => candidate.tool === "queryAirports");
  const rows = rankingRows(call);
  if (!call || !rows || rows.length === 0 || !filtersByCodeAlone(call.args)) {
    return null;
  }

  const question = previousQuestion(messages, index);
  if (question === null) {
    return null;
  }
  // A question that spells out the airport resolved itself: there is no carry to
  // report, whatever the model chose to call the tool with.
  const phrase = referencePhrase(question);
  if (phrase === null || namesAnAirport(question, rows)) {
    return null;
  }

  const source = carriedFrom(messages, index, rows.map((row) => row.iata));
  if (!source) {
    return null;
  }
  const airports = rows.map((row) => ({
    iata: row.iata,
    name: row.name,
    rank: source.codes.indexOf(row.iata) + 1,
  }));

  return {
    phrase,
    from: source.phrase,
    airports,
    summary: summaryOf(airports, source.phrase),
    note: CARRIED_CONTEXT_NOTE,
  };
}

/**
 * A follow-up on an earlier row names codes and no place: a new place phrase is
 * a new question about a new set, which the resolved airport set already
 * explains on its own.
 */
function filtersByCodeAlone(args: JsonObject): boolean {
  const namesCodes = typeof args.iata === "string" || Array.isArray(args.iata);
  const filtersByPlace = PLACE_FIELDS.some((field) => {
    const value = args[field];
    return typeof value === "string" && value !== "";
  });
  return namesCodes && !filtersByPlace;
}

/** The reference as the analyst wrote it, so the block quotes them. */
function referencePhrase(question: string): string | null {
  for (const pattern of REFERENCE_PATTERNS) {
    const match = pattern.exec(question);
    if (match) {
      return match[0].toLowerCase();
    }
  }
  return null;
}

/**
 * Whether the question already names one of these airports, by code or by the
 * municipality the snapshot spells it with. If it does, the thread resolved
 * nothing: the analyst did.
 */
function namesAnAirport(
  question: string,
  rows: readonly { iata: string; municipality: string }[],
): boolean {
  return rows.some(
    (row) => containsWord(question, row.iata) || containsWord(question, row.municipality),
  );
}

/** Whether the text spells this word out, rather than containing its letters. */
function containsWord(text: string, word: string): boolean {
  return indexOfPhrase(text, word) !== -1;
}

/**
 * The earlier answer these codes came from: the most recent one whose resolved
 * airport set holds every one of them. Searching backwards means a thread that
 * ranked twice carries from the ranking the analyst was last looking at.
 */
function carriedFrom(
  messages: readonly ThreadMessage[],
  index: number,
  codes: readonly string[],
): { phrase: string; codes: string[] } | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    const message = messages[at];
    if (message?.role !== "assistant") continue;
    for (const call of message.toolCalls) {
      const view = rankingView(call);
      if (view && codes.every((code) => view.resolved.codes.includes(code))) {
        return { phrase: view.resolved.phrase, codes: view.resolved.codes };
      }
    }
  }
  return null;
}

function summaryOf(airports: readonly CarriedAirport[], from: string): string {
  const rows = airports.map((airport) => `${airport.iata} · row ${airport.rank}`).join(", ");
  return `${rows} of the ${from} answer earlier in this thread`;
}
