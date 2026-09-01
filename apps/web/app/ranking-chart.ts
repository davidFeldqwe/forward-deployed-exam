/**
 * The ranking as a composite bar chart (issue #30 / PRD stories 31-32): one
 * horizontal bar per IATA, the same rows the table drew, composite only.
 *
 * Bars take their hue from the row's candidate lamp. Partial inputs and No data
 * have no composite, so they have no bar — a missing component is not a low
 * score, and a grey placeholder must not print a number the screen withheld.
 *
 * A single-metric lookup is not a ranking: it has no composite column, so it
 * has no chart either.
 */
import type { CandidateLamp, ScoredAirport } from "@repo/scoring";

import { lookupMetric, rankingRows, type ToolCall } from "./thread-messages.ts";

export type CompositeBar = {
  iata: string;
  name: string;
  lamp: CandidateLamp;
  /**
   * The composite the table prints, or null where the screen withheld one.
   * The chart must not invent a length for a null.
   */
  composite: number | null;
};

export type CompositeChartView = {
  bars: CompositeBar[];
  caption: string;
};

export const COMPOSITE_CHART_CAPTION =
  "Composite score 0–100 by IATA, the same rows as the ranking table. " +
  "Partial inputs and No data have no bar: a missing component is not a low composite.";

/**
 * The chart for one stored `queryAirports` ranking, or null when this call is
 * not one — a lookup, a methodology call, or a ranking that matched nothing.
 */
export function compositeChart(call: ToolCall | undefined): CompositeChartView | null {
  const rows = rankingRows(call);
  if (!call || !rows || rows.length === 0) {
    return null;
  }
  if (lookupMetric(call) !== null) {
    return null;
  }
  return {
    bars: rows.map(barOf),
    caption: COMPOSITE_CHART_CAPTION,
  };
}

function barOf(row: ScoredAirport): CompositeBar {
  return {
    iata: row.iata,
    name: row.name,
    lamp: row.candidateLamp,
    composite: row.composite,
  };
}
