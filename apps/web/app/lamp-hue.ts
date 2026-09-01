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
import type { CandidateLamp } from "@repo/scoring";

/** Which hue a lamp word lights. Never drawn without the lamp's words beside it. */
type LampTone = "strong" | "mixed" | "weak" | "none";

const LAMP_TONES: Readonly<Record<CandidateLamp, LampTone>> = {
  "Strong candidate": "strong",
  "Mixed vector": "mixed",
  "Weak candidate": "weak",
  // Coverage states take no hue at all: missing data is never red.
  "Partial inputs": "none",
  "No data": "none",
};

/** The pill a lamp word sits in: hue on its text and a wash of it behind. */
const LAMP_PILL: Readonly<Record<LampTone, string>> = {
  strong: "border-lamp-strong/35 bg-lamp-strong/12 text-lamp-strong",
  mixed: "border-lamp-mixed/35 bg-lamp-mixed/12 text-lamp-mixed",
  weak: "border-lamp-weak/35 bg-lamp-weak/12 text-lamp-weak",
  none: "border-border bg-transparent text-muted-foreground",
};

/**
 * The custom property one lamp word lights on the `/map` skyline. A canvas
 * material takes a colour rather than a class, so the two surfaces are held
 * together by the token rather than by a second copy of the hex: a column and
 * the ranking row for the same IATA read `--lamp-strong` off one stylesheet.
 *
 * The coverage states take the muted foreground — the grey their pill's text
 * already is — because a ring is not a hue, and missing is never red.
 */
const LAMP_VARIABLE: Readonly<Record<LampTone, string>> = {
  strong: "--lamp-strong",
  mixed: "--lamp-mixed",
  weak: "--lamp-weak",
  none: "--muted-foreground",
};

/** The custom property the canvas resolves for one lamp word. */
export function lampVariable(lamp: CandidateLamp): string {
  return LAMP_VARIABLE[LAMP_TONES[lamp]];
}

/**
 * The pill classes one lamp word draws. Both the ranking rows and the legend
 * that names all five words come through here, so a row and its key cannot
 * disagree about what green means.
 */
export function lampPill(lamp: CandidateLamp): string {
  return LAMP_PILL[LAMP_TONES[lamp]];
}

/**
 * The marker one lamp word draws on the resolved-set map (issue #29): the same
 * three hues, as a filled dot with its own outline. A dot carries no words, so
 * this is only ever drawn beside the map's legend — which is the ranking
 * table's legend, printing all five lamp words — and each marker keeps its IATA
 * code next to it. Partial inputs and No data are an outline and no hue here
 * too: a coverage state is not a weak composite on a map either.
 */
const LAMP_MARKER: Readonly<Record<LampTone, string>> = {
  strong: "fill-lamp-strong/70 stroke-lamp-strong",
  mixed: "fill-lamp-mixed/70 stroke-lamp-mixed",
  weak: "fill-lamp-weak/70 stroke-lamp-weak",
  none: "fill-transparent stroke-muted-foreground",
};

/** The marker classes one lamp word draws, from the same tone as its pill. */
export function lampMarker(lamp: CandidateLamp): string {
  return LAMP_MARKER[LAMP_TONES[lamp]];
}

export const LAMP_LEGEND_NOTE =
  "Hue reads with the lamp words, never instead of them. Partial inputs and No data " +
  "take an outline and no hue: a missing component is not a low composite.";
