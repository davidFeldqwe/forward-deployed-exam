import type { PeerGroup, SnapshotAirport } from "@repo/snapshot";

import { COMPONENTS, type Component } from "./types.ts";

/**
 * Percentile of `value` inside `values` (which contains it): the share of the
 * peer group ranked below it, counting a tie as half. A lone airport in its
 * peer group is the median of itself (50), not the top of the country.
 *
 * Rounded to an integer so the score vector an analyst reads is the score
 * vector the composite is computed from. `values` always holds `value`, because
 * a raw value is pushed onto its own peer group's distribution below, so it is
 * never empty here.
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

/** The raw values one peer group is ranked against, per component. */
export type PeerDistribution = Record<Component, number[]>;

/**
 * Keyed by every hub size, so an airport's distribution is always present: the
 * keys are pinned to the snapshot's `PeerGroup`, and adding a hub size there
 * fails to typecheck here rather than silently ranking against nothing.
 */
export type PeerDistributions = Record<PeerGroup, PeerDistribution>;

/**
 * The raw values each peer group is ranked against, per component. Missing
 * inputs are left out of the distribution rather than counted as zero, so one
 * airport's blank never moves its peers' percentiles.
 */
export function peerDistributions(airports: readonly SnapshotAirport[]): PeerDistributions {
  const distributions: PeerDistributions = {
    large: emptyDistribution(),
    medium: emptyDistribution(),
    small: emptyDistribution(),
  };
  for (const airport of airports) {
    const distribution = distributions[airport.peerGroup];
    for (const component of COMPONENTS) {
      const { raw } = airport.inputs[component];
      if (raw !== null) distribution[component].push(raw);
    }
  }
  return distributions;
}

function emptyDistribution(): PeerDistribution {
  return { congestion: [], unmetFlightDemand: [], delay: [], growth: [] };
}
