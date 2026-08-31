/**
 * A **Thread answer**: one assistant turn as an ordered list of tags, in the
 * locked grouped order (issue #35) — the inspectable tool rows, the carried
 * context a follow-up resolved, every resolved airport set, the model's prose,
 * every ranking or lookup table, then one caveats block for the whole turn.
 *
 * Grouped, not interleaved: a turn that ran `queryAirports` twice names both
 * sets before it says anything, and prints both tables under the one sentence
 * that explains them. Empty tags are omitted, so a methodology-only turn is a
 * tool row and prose.
 *
 * The order lives here rather than in `Transcript.tsx` because it is a claim
 * about the answer shape, and a claim asserted by reading JSX is a claim tested
 * by grep. The transcript draws tags; this list decides which ones and in what
 * order.
 */
import { carriedContext, type CarriedContext } from "./carried-context.ts";
import { pendingAnswer } from "./pending-answer.ts";
import {
  rankingView,
  type RankingRowView,
  type RankingUnknowns,
  type RankingView,
  type ResolvedSet,
} from "./ranking-view.ts";
import { spokenProse } from "./read-aloud.ts";
import type { ThreadMessage, ToolCall } from "./thread-messages.ts";

export type ThreadAnswerPart =
  | { tag: "tool"; call: ToolCall }
  | { tag: "carried"; carried: CarriedContext }
  | { tag: "resolved"; resolved: ResolvedSet; unknown: RankingUnknowns }
  | {
      tag: "prose";
      text: string;
      /** The boundary label, or null where there is no table to tell it from. */
      heading: string | null;
      /** This prose, when it is the one the read-aloud control speaks. */
      spoken: string | null;
    }
  | { tag: "ranking"; rows: RankingRowView[]; lookup: RankingView["lookup"]; sortLabel: string }
  | ({ tag: "pending" } & typeof pendingAnswer)
  | { tag: "caveats"; assumptions: string[]; gaps: string[] };

/** The tag of every block a Thread answer may draw. */
export type ThreadAnswerTag = ThreadAnswerPart["tag"];

/**
 * The same tags as a list, so the test that every one of them is drawn has
 * something to walk. `satisfies` keeps the two from drifting: a name no part
 * carries is not a tag.
 */
export const THREAD_ANSWER_TAGS = [
  "tool",
  "carried",
  "resolved",
  "prose",
  "ranking",
  "pending",
  "caveats",
] as const satisfies readonly ThreadAnswerTag[];

/**
 * What marks the model's sentences off from the screen's numbers. Drawn only
 * where a table sits under the prose: a label marks a boundary, so it needs
 * something on the other side of it.
 */
export const PROSE_HEADING = "AI explanation";

/** The prose part, as the block that draws it takes it. */
export type ProsePart = Extract<ThreadAnswerPart, { tag: "prose" }>;

/** The one part the pending Thread answer is made of, as the row draws it. */
export type PendingRowPart = Extract<ThreadAnswerPart, { tag: "pending" }>;

/**
 * The answer between Send and the tool payload landing (PRD story 35): a row,
 * and nothing that could carry a score. There is no composite, no candidate
 * lamp and no score vector in this list — not even the withheld-composite mark,
 * which says the screen ran and held a number back, and nothing has run yet.
 *
 * The in-flight question is a user turn, not part of this list, and Chat is
 * what decides the form is in flight.
 */
export const PENDING_THREAD_ANSWER: readonly [PendingRowPart] = [
  { tag: "pending", ...pendingAnswer },
];

/**
 * The Thread answer for the turn at `index`, or an empty list where that turn is
 * not an assistant's.
 */
export function threadAnswer(
  messages: readonly ThreadMessage[],
  index: number,
): ThreadAnswerPart[] {
  const message = messages[index];
  if (!message || message.role !== "assistant") {
    return [];
  }
  const views = message.toolCalls
    .map((call) => rankingView(call))
    .filter((view): view is RankingView => view !== null);
  // A query that matched nothing has a resolved set to show and no table, so
  // the tables are their own list: what the prose is labelled off from.
  const tables = views.filter((view) => view.rows.length > 0);
  const carried = carriedContext(messages, index);

  // The locked order, one group per block, each one skipped where it is empty.
  const parts: ThreadAnswerPart[] = [];
  for (const call of message.toolCalls) {
    parts.push({ tag: "tool", call });
  }
  // Before the resolved set and the vector under it: how the follow-up
  // reference was resolved comes before any number read for it.
  if (carried) {
    parts.push({ tag: "carried", carried });
  }
  for (const view of views) {
    parts.push({ tag: "resolved", resolved: view.resolved, unknown: view.unknown });
  }
  if (message.text.trim().length > 0) {
    parts.push({
      tag: "prose",
      text: message.text,
      heading: tables.length > 0 ? PROSE_HEADING : null,
      spoken: spokenProse(messages, index),
    });
  }
  for (const view of tables) {
    parts.push({
      tag: "ranking",
      rows: view.rows,
      lookup: view.lookup,
      sortLabel: view.sortLabel,
    });
  }
  const assumptions = mergedLines(views, "assumptions");
  const gaps = mergedLines(views, "gaps");
  if (assumptions.length > 0 || gaps.length > 0) {
    parts.push({ tag: "caveats", assumptions, gaps });
  }
  return parts;
}

// One caveats block per answer, even when the answer ran two queries.
function mergedLines(views: readonly RankingView[], key: "assumptions" | "gaps"): string[] {
  return [...new Set(views.flatMap((view) => view[key]))];
}
