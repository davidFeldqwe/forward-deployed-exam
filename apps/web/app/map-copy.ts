/**
 * The `/map` surface's content (issue #69 / #68). The bar it sits under is
 * `app/site-header.ts`; what the canvas draws is `app/map-view.ts`.
 *
 * The legend is the reason hue is allowed on the canvas at all: every lamp word
 * is named beside the hue it lights, and the two coverage states are named as
 * rings rather than as a colour. A visitor who cannot tell green from red still
 * reads the skyline.
 */
import {
  CANDIDATE_LAMPS,
  MIXED_VECTOR_AT,
  STRONG_CANDIDATE_AT,
  type CandidateLamp,
} from "@repo/scoring";

/** One legend line: a lamp word, the shape it draws, and what it means. */
export type LampLegendEntry = {
  lamp: CandidateLamp;
  /** Names the shape as well as the number, so the key reads without colour. */
  meaning: string;
};

/**
 * What each lamp word draws, and the band of composites behind it. The bands
 * are the scoring module's own, as `describeMethodology` states them, so the
 * key cannot name a threshold the lamps are not drawn at.
 *
 * The two coverage states lie flat: missing is not a low composite, so the key
 * gives them a shape of their own rather than a hue at the bottom of a scale.
 */
const LEGEND_MEANINGS: Readonly<Record<CandidateLamp, string>> = {
  "Strong candidate": `column, composite ${STRONG_CANDIDATE_AT} and over`,
  "Mixed vector": `column, composite ${MIXED_VECTOR_AT} to ${STRONG_CANDIDATE_AT - 1}`,
  "Weak candidate": `column, composite under ${MIXED_VECTOR_AT}`,
  "Partial inputs": "flat ring — a component is missing, so there is no composite to stand it up",
  "No data": "flat ring — no component arrived",
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
  /**
   * The corner viewports. The two places are drawn where they are, so the note
   * says what the boxes are rather than dressing them as a separate map.
   */
  insets:
    "Alaska and Hawaii stand in corner insets of this same view, at their own " +
    "coordinates and on the same scoring payload. Click one to bring the map to it.",
  legendHeading: "Candidate lamp",
  legend: CANDIDATE_LAMPS.map((lamp) => ({
    lamp,
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
