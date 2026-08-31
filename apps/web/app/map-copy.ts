/**
 * The `/map` surface's content (issue #69 / #68). The bar it sits under is
 * `app/site-header.ts`; what the canvas draws is `app/map-view.ts`.
 *
 * The legend is the reason hue is allowed on the canvas at all: every lamp word
 * is named beside the hue it lights, and the two coverage states are named as
 * rings rather than as a colour. A visitor who cannot tell green from red still
 * reads the skyline.
 */
import { CANDIDATE_LAMPS, type CandidateLamp } from "@repo/scoring";

/** One legend line: a lamp word, the shape it draws, and what it means. */
export type LampLegendEntry = {
  lamp: CandidateLamp;
  shape: "column" | "ring";
  meaning: string;
};

const LEGEND_MEANINGS: Readonly<Record<CandidateLamp, string>> = {
  "Strong candidate": "A composite of 70 or more: a tall column.",
  "Mixed vector": "A composite of 40 to 69.",
  "Weak candidate": "A composite under 40: a short column.",
  "Partial inputs": "Some of the four components are missing, so the screen withholds a composite — a flat ring, with no height to read.",
  "No data": "None of the four components arrived. A flat ring, like Partial inputs.",
};

export const mapCopy = {
  title: "Capacity-pressure skyline",
  intro:
    "Every airport in the committed screen, standing at its own coordinates. " +
    "The numbers are the ones chat answers with — one scoring module, two surfaces.",
  encoding:
    "Column height is the composite score, 0–100, linear: a composite of 80 is " +
    "twice the column of 40. Every column is the same width, so FAA hub size is " +
    "not a second thing to read off the canvas.",
  legendHeading: "Candidate lamp",
  legend: CANDIDATE_LAMPS.map((lamp) => ({
    lamp,
    // The two coverage states lie flat: missing is not a low composite.
    shape: lamp === "Partial inputs" || lamp === "No data" ? "ring" : "column",
    meaning: LEGEND_MEANINGS[lamp],
  })) satisfies readonly LampLegendEntry[],
  /** What a screen reader is told the canvas is; it cannot read the mesh. */
  canvasLabel: "Capacity-pressure skyline of the airports in the screen",
  /**
   * No WebGL context: say so and point at the numbers, rather than drawing a
   * second map that could disagree with this one.
   */
  noWebgl: {
    heading: "This view needs WebGL.",
    body:
      "Your browser did not give the page a canvas to draw on. The screen itself " +
      "is not in the canvas: every composite score and candidate lamp here comes " +
      "from scoreUniverse over the committed snapshot, which chat answers from too.",
  },
} as const;
