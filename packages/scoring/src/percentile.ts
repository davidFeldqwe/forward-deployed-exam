import type { SnapshotAirport } from "@repo/snapshot";

import { COMPONENTS, type Component } from "./types.ts";

/**
 * Percentile of `value` inside `values` (which contains it): the share of the
 * peer group ranked below it, counting a tie as half. A lone airport in its
 * peer group is the median of itself (50), not the top of the country.
 *
 * Rounded to an integer so the score vector an analyst reads is the score
 * vector the composite is computed from. `values` always holds `value`, because
 * both come from the same peer group, so it is never empty here.
 */
export function percentileRank(value: number, values: readonly number[]): number {
  let below = 0;
  let tied = 0;
  for (const other of values) {
    if (other < value) below += 1;
    else if (other === value) tied += 1;
  }
  return Math.round((100 * (below + tied / 2)) / values.length);
}

export type PeerDistribution = Record<Component, number[]>;

/**
 * The raw values each peer group is ranked against, per component. Missing
 * inputs are left out of the distribution rather than counted as zero, so one
 * airport's blank never moves its peers' percentiles.
 */
export function peerDistributions(
  airports: readonly SnapshotAirport[],
): Map<string, PeerDistribution> {
  const distributions = new Map<string, PeerDistribution>();
  for (const airport of airports) {
    let distribution = distributions.get(airport.peerGroup);
    if (distribution === undefined) {
      distribution = { congestion: [], unmetFlightDemand: [], delay: [], growth: [] };
      distributions.set(airport.peerGroup, distribution);
    }
    for (const component of COMPONENTS) {
      const { raw } = airport.inputs[component];
      if (raw !== null) distribution[component].push(raw);
    }
  }
  return distributions;
}
