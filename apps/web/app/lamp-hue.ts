/**
 * The candidate lamp's hues (issue #25, PRD stories 25-27). Hue is a companion
 * to the lamp's words, never a substitute: every class here rides on a pill that
 * prints the lamp text, and the legend below the ranking table names all five
 * words beside their hue, so the table is readable without seeing colour.
 *
 * Strong is green, Mixed is yellow, Weak is red. Partial inputs and No data are
 * coverage states, so they are an outline with no hue at all — missing data is
 * not a low composite, and never red.
 */
import { CANDIDATE_LAMPS, type CandidateLamp } from "@repo/scoring";

import { lampTone, type LampTone } from "./ranking-view.ts";

/** The pill a lamp word sits in: hue on its text and a wash of it behind. */
export const LAMP_PILL: Readonly<Record<LampTone, string>> = {
  strong: "border-lamp-strong/35 bg-lamp-strong/12 text-lamp-strong",
  mixed: "border-lamp-mixed/35 bg-lamp-mixed/12 text-lamp-mixed",
  weak: "border-lamp-weak/35 bg-lamp-weak/12 text-lamp-weak",
  none: "border-border bg-transparent text-muted-foreground",
};

export type LampLegendEntry = {
  lamp: CandidateLamp;
  tone: LampTone;
  /** The same pill the ranking row draws, so the key cannot drift from the row. */
  pill: string;
};

/** All five lamp words, in ranking order, each with the hue its rows light. */
export const LAMP_LEGEND: readonly LampLegendEntry[] = CANDIDATE_LAMPS.map((lamp) => ({
  lamp,
  tone: lampTone(lamp),
  pill: LAMP_PILL[lampTone(lamp)],
}));

export const LAMP_LEGEND_LABEL = "Candidate lamp";

export const LAMP_LEGEND_NOTE =
  "Hue reads with the lamp words, never instead of them. Partial inputs and No data " +
  "take an outline and no hue: a missing component is not a low composite.";
