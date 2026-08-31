import type { AirportSnapshot, SnapshotAirport } from "@repo/snapshot";

import { assumptionsFor, gapsFor, sharedAssumptions } from "./caveats.ts";
import { peerDistributions, percentileRank, type PeerDistribution } from "./percentile.ts";
import { MIXED_VECTOR_AT, STRONG_CANDIDATE_AT, WEIGHTS } from "./weights.ts";
import {
  COMPONENTS,
  type CandidateLamp,
  type Component,
  type ScoreComponent,
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
    const peers = distributions[airport.peerGroup];
    const scoreVector: ScoreVector = {
      congestion: rank(airport, "congestion", peers),
      unmetFlightDemand: rank(airport, "unmetFlightDemand", peers),
      delay: rank(airport, "delay", peers),
      growth: rank(airport, "growth", peers),
    };

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
      assumptions: assumptionsFor(shared, airport),
      gaps: gapsFor(snapshot, airport),
    };
  });
}

function rank(
  airport: SnapshotAirport,
  component: Component,
  peers: PeerDistribution,
): ScoreComponent {
  const { raw, coverage } = airport.inputs[component];
  return {
    percentile: raw === null ? null : percentileRank(raw, peers[component]),
    raw,
    coverage,
  };
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

/**
 * The lamp for one row, read off that row alone. Coverage outranks the number:
 * a 3-of-4 row is Partial inputs even when it is handed a composite, because
 * missing is not a low score.
 */
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
