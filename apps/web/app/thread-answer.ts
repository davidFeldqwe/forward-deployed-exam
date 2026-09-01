/**
 * A **Thread answer**: one assistant turn as an ordered list of tags, in the
 * locked grouped order (issue #35, map slot from #29, prose-first from #94) —
 * the model's prose, then one inspect block for the agent run (tool rows and
 * the resolved airport set), the carried context a follow-up resolved, every
 * ranking or lookup table, the in-thread map of each ranking that earned one,
 * the composite bar chart of each ranking, then one caveats block for the
 * whole turn.
 *
 * Grouped, not interleaved: a turn that ran `queryAirports` twice keeps both
 * calls and both resolved sets in the one inspect block, and prints both
 * tables under the one sentence that explains them. Empty tags are omitted, so
 * a methodology-only turn is prose then inspect.
 *
 * The order lives here rather than in the JSX because it is a claim about the
 * answer shape, and a claim asserted by reading JSX is a claim tested by grep.
 * `ThreadAnswer.tsx` says what each tag looks like; this list decides which
 * tags a turn has and in what order.
 */
import { carriedContext, type CarriedContext } from "./carried-context.ts";
import { pendingAnswer } from "./pending-answer.ts";
import { compositeChart, type CompositeChartView } from "./ranking-chart.ts";
import {
  rankingView,
  type RankingRowView,
  type RankingUnknowns,
  type RankingView,
  type ResolvedSet,
} from "./ranking-view.ts";
import { spokenProse } from "./read-aloud.ts";
import { resolvedMap, type ResolvedMapView } from "./resolved-map.ts";
import { previousQuestion, type ThreadMessage, type ToolCall } from "./thread-messages.ts";

/** The resolved airport set a `queryAirports` call named, with its refusals. */
export type InspectSet = { resolved: ResolvedSet; unknown: RankingUnknowns };

/** One block of an answer: the tag `ThreadAnswer.tsx` draws, and what it draws from. */
export type ThreadAnswerPart =
  | { tag: "inspect"; calls: readonly ToolCall[]; sets: readonly InspectSet[] }
  | { tag: "carried"; carried: CarriedContext }
  | {
      tag: "prose";
      text: string;
      /** The boundary label, or null where there is no table to tell it from. */
      heading: string | null;
      /**
       * This prose, when it is the one the read-aloud control speaks —
       * `read-aloud.ts` decides which turn that is.
       */
      spoken: string | null;
    }
  | { tag: "ranking"; rows: RankingRowView[]; lookup: RankingView["lookup"]; sortLabel: string }
  | { tag: "map"; map: ResolvedMapView }
  | { tag: "chart"; chart: CompositeChartView }
  | ({ tag: "pending" } & typeof pendingAnswer)
  | { tag: "caveats"; assumptions: string[]; gaps: string[] };

/** The tag of every block a Thread answer may draw. */
export type ThreadAnswerTag = ThreadAnswerPart["tag"];

/** The inspect part, as the Show more block draws it. */
export type InspectPart = Extract<ThreadAnswerPart, { tag: "inspect" }>;

/** The prose part, as the block that draws it takes it. */
export type ProsePart = Extract<ThreadAnswerPart, { tag: "prose" }>;

/** The one part the pending Thread answer is made of, as the row draws it. */
export type PendingRowPart = Extract<ThreadAnswerPart, { tag: "pending" }>;

/**
 * The locked order as a list: the sequence every answer below is composed to
 * read down, and what the order test walks. A tag this list forgets to name has
 * nowhere to be drawn, which is what that test reports.
 *
 * `pending` is the one tag with no neighbours to be ordered against — a
 * question in flight is drawn as that row alone — so its place here only has to
 * be somewhere the order test can find it.
 */
export const THREAD_ANSWER_TAGS = [
  "prose",
  "inspect",
  "carried",
  "ranking",
  "map",
  "chart",
  "pending",
  "caveats",
] as const satisfies readonly ThreadAnswerTag[];

/**
 * What marks the model's sentences off from the screen's numbers. Drawn only
 * where a table sits under the prose: a label marks a boundary, so it needs
 * something on the other side of it.
 */
export const PROSE_HEADING = "AI explanation";

/**
 * The closed control that holds tool rows and the resolved airport set (issue
 * #94), so a ranking reads as an explanation until the analyst opens it.
 */
export const SHOW_MORE_LABEL = "Show more";

/**
 * The answer between Send and the tool payload landing (PRD story 35): a row,
 * and nothing that could carry a score — no composite, no candidate lamp, no
 * score vector, and not the withheld-composite mark either (`pending-answer.ts`
 * says why).
 *
 * The in-flight question is a user turn, not part of this list, and the
 * composer's form is what says the answer is still on its way.
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
  // Every `queryAirports` call this turn made, as answer objects.
  const queries = message.toolCalls
    .map((call) => rankingView(call))
    .filter((view) => view !== null);
  // A query that matched nothing has a resolved set to show and no table, so
  // the tables are their own list: what the prose is labelled off from.
  const tables = queries.filter((view) => view.rows.length > 0);
  const carried = carriedContext(messages, index);

  // The locked order, one group per block, each one skipped where it is empty.
  const parts: ThreadAnswerPart[] = [];
  if (message.text.trim().length > 0) {
    parts.push({
      tag: "prose",
      text: message.text,
      heading: tables.length > 0 ? PROSE_HEADING : null,
      spoken: spokenProse(messages, index),
    });
  }
  // Agent chrome: every tool call and every resolved set, one block so the
  // transcript can hide them behind a single Show more.
  if (message.toolCalls.length > 0) {
    parts.push({
      tag: "inspect",
      calls: message.toolCalls,
      sets: queries.map((view) => ({ resolved: view.resolved, unknown: view.unknown })),
    });
  }
  // After inspect, before the vector: how the follow-up reference was resolved
  // comes before any number read for it.
  if (carried) {
    parts.push({ tag: "carried", carried });
  }
  for (const view of tables) {
    parts.push({
      tag: "ranking",
      rows: view.rows,
      lookup: view.lookup,
      sortLabel: view.sortLabel,
    });
  }
  // After every table, still before caveats: a picture of the same rows, when
  // this question named a place the call filtered on. Grouped by tag the way
  // the tables are — not interleaved between two rankings.
  const question = previousQuestion(messages, index);
  for (const call of message.toolCalls) {
    const map = resolvedMap(question, call);
    if (map) {
      parts.push({ tag: "map", map });
    }
  }
  // After the map when one is present, still before caveats: the same ranking
  // payload as a composite bar. Lookups and empty sets skip this the way they
  // skip a table.
  for (const call of message.toolCalls) {
    const chart = compositeChart(call);
    if (chart) {
      parts.push({ tag: "chart", chart });
    }
  }
  const assumptions = mergedLines(queries, "assumptions");
  const gaps = mergedLines(queries, "gaps");
  if (assumptions.length > 0 || gaps.length > 0) {
    parts.push({ tag: "caveats", assumptions, gaps });
  }
  return parts;
}

// One caveats block per answer, even when the answer ran two queries.
function mergedLines(views: readonly RankingView[], key: "assumptions" | "gaps"): string[] {
  return [...new Set(views.flatMap((view) => view[key]))];
}
