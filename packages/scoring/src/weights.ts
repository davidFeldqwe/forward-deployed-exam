import type { Component } from "./types.ts";

/**
 * Fixed, not a UI knob (PRD "Scoring"): constraint-relief (congestion and unmet
 * flight demand) outweighs growth. They sum to 100, so the composite is on the
 * same 0-100 scale as the percentiles it is built from.
 */
export const WEIGHTS: Readonly<Record<Component, number>> = {
  congestion: 35,
  unmetFlightDemand: 35,
  delay: 20,
  growth: 10,
};

/** Candidate-lamp bands on the composite, from the locked prototype. */
export const STRONG_CANDIDATE_AT = 70;
export const MIXED_VECTOR_AT = 40;
