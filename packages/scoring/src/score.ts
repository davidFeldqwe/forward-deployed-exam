import type { AirportSnapshot } from "@repo/snapshot";

import { assumptionsFor, gapsFor, missingComponents, sharedAssumptions } from "./caveats.ts";
import { peerDistributions, percentileRank } from "./percentile.ts";
import { MIXED_VECTOR_AT, STRONG_CANDIDATE_AT, WEIGHTS } from "./weights.ts";
import {
  COMPONENTS,
  type CandidateLamp,
  type ScoreVector,
  type ScoredAirport,
} from "./types.ts";

/**
 * Scores every airport in the snapshot. All four components point the same way:
 * a higher raw value is more capacity pressure, so a higher percentile is a
 * stronger renovation-investment case.
 *
 * Percentiles are national within the airport's FAA hub-size peer group and are
 * computed once, here. `queryAirports` filters these rows; nothing downstream
 * re-percentiles a subset.
 */
export function scoreUniverse(snapshot: AirportSnapshot): ScoredAirport[] {
  const distributions = peerDistributions(snapshot.airports);
  const shared = sharedAssumptions(snapshot);

  return snapshot.airports.map((airport) => {
    const distribution = distributions.get(airport.peerGroup);
    const scoreVector = Object.fromEntries(
      COMPONENTS.map((component) => {
        const { raw, coverage } = airport.inputs[component];
        const peers = distribution?.[component] ?? [];
        return [
          component,
          {
            percentile: raw === null ? null : percentileRank(raw, peers),
            raw,
            coverage,
          },
        ];
      }),
    ) as ScoreVector;

    const composite = compositeOf(scoreVector);
    return {
      iata: airport.iata,
      name: airport.name,
      municipality: airport.municipality,
      state: airport.state,
      region: airport.region,
      peerGroup: airport.peerGroup,
      scoreVector,
      composite,
      candidateLamp: candidateLamp({ composite, scoreVector }),
      slotLimit: airport.slotLimit,
      longHaulShare: airport.longHaulShare.share,
      assumptions: assumptionsFor(shared, airport, missingComponents(airport)),
      gaps: gapsFor(snapshot, airport),
    };
  });
}

/**
 * The weighted mean of the four percentiles, rounded, or null when any of them
 * is missing. Withholding beats a 3-of-4 number: a zero-fill would read as a
 * low score and re-weighting the rest would invent one.
 */
function compositeOf(scoreVector: ScoreVector): number | null {
  let weighted = 0;
  for (const component of COMPONENTS) {
    const { percentile } = scoreVector[component];
    if (percentile === null) return null;
    weighted += WEIGHTS[component] * percentile;
  }
  return Math.round(weighted / 100);
}

export function candidateLamp(
  row: Pick<ScoredAirport, "composite" | "scoreVector">,
): CandidateLamp {
  const present = COMPONENTS.filter(
    (component) => row.scoreVector[component].coverage === "present",
  ).length;
  if (present === 0) return "No data";
  if (present < COMPONENTS.length) return "Partial inputs";
  if (row.composite === null) return "No data";
  if (row.composite >= STRONG_CANDIDATE_AT) return "Strong candidate";
  if (row.composite >= MIXED_VECTOR_AT) return "Mixed vector";
  return "Weak candidate";
}
