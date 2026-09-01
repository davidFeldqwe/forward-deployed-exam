/**
 * Column inspect on `/map` (issue #71 / #68): one tooltip for hover, keyboard
 * focus, and a tap-pin, read off the mark `map-view.ts` already copied from
 * `scoreUniverse`. Native `title` is not this UI, and neither is a sidecar
 * table — the canvas stays a skyline plus this one card.
 */
import type { CandidateLamp, ScoreVector } from "@repo/scoring";

import type { MapMark } from "./map-view.ts";

/** The four fields the inspect card shows, and nothing else. */
export type InspectTooltip = {
  iata: string;
  lamp: CandidateLamp;
  composite: number | null;
  scoreVector: ScoreVector;
};

export type InspectIntent = {
  kind: "hover" | "focus" | "tap";
  iata: string | null;
};

/**
 * Three ways to name a column, kept separate so a pin can outlive the pointer
 * leaving it, and so a hover on desktop is not trapped by a tap from earlier.
 */
export type InspectState = {
  hover: string | null;
  focus: string | null;
  pin: string | null;
};

export const emptyInspect: InspectState = { hover: null, focus: null, pin: null };

/** The scored row's own identity, lamp, composite, and score vector. */
export function inspectTooltip(mark: MapMark): InspectTooltip {
  return {
    iata: mark.iata,
    lamp: mark.lamp,
    composite: mark.composite,
    scoreVector: mark.scoreVector,
  };
}

/**
 * What the card should show: a live hover or focus first, so desktop hover is
 * not stuck on a pin, then the pin a tap left behind.
 */
export function inspectIata(state: InspectState): string | null {
  return state.hover ?? state.focus ?? state.pin;
}

export function reduceInspect(state: InspectState, intent: InspectIntent): InspectState {
  switch (intent.kind) {
    case "hover":
      return { ...state, hover: intent.iata };
    case "focus":
      return { ...state, focus: intent.iata };
    case "tap":
      if (intent.iata === null || state.pin === intent.iata) {
        // Empty ground, or a second tap on the pinned column: the pin lets go.
        return { ...state, hover: null, pin: null };
      }
      return { ...state, hover: intent.iata, pin: intent.iata };
  }
}
