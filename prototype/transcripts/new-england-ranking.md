# Transcript — New England ranking

Throwaway fixture for [Prototype the answer shape and chat UI](https://github.com/davidFeldqwe/forward-deployed-exam/issues/10). Numbers are fake. Comparison window: 2023–2024.

**Question:** Which airports in New England are strong candidates for terminal expansion?

---

**User**

Which airports in New England are strong candidates for terminal expansion?

**Tool** `queryAirports` — complete (318 ms)

- Arguments: `region` = New England · `sortBy` = composite · `limit` = 10
- Result: 8 rows · 7 fully scored · 1 partial inputs (HYA) · max composite 79 (BOS)

**Resolved airport set**

New England → CT, ME, MA, NH, RI, VT → BOS, PVD, BDL, MHT, PWM, BTV, ORH, HYA — 8 airports found · 7 fully scored, 1 with partial inputs.

**Prose**

One airport in the resolved set clears the strong-candidate threshold: BOS at composite 79, driven by congestion (88th percentile among large hubs) and unmet flight demand (81st). PVD and BDL sit in the mixed band — their congestion percentiles are high inside the medium-hub peer group, but absolute passenger-per-runway load is roughly a quarter of Boston's.

HYA has no composite because delay data is missing, not because it scored poorly.

**Ranking** (composite 0–100 · percentile within FAA hub-size peer group)

| # | Airport | Composite | Candidate lamp | Why-labels |
|---|---------|-----------|----------------|------------|
| 1 | BOS Boston Logan Intl | 79 | Strong candidate | Large hub · Long-haul share 24.1% |
| 2 | PVD T.F. Green Intl | 67 | Mixed vector | Medium hub |
| 3 | BDL Bradley Intl | 61 | Mixed vector | Medium hub |
| 4 | MHT Manchester–Boston Regional | 53 | Mixed vector | Small hub |
| 5 | PWM Portland Intl Jetport | 49 | Mixed vector | Small hub |
| 6 | BTV Burlington Intl | 43 | Mixed vector | Small hub |
| 7 | ORH Worcester Regional | 30 | Weak candidate | Small hub |
| 8 | HYA Hyannis / Barnstable Muni | — | Partial inputs | Non-hub · Seasonal schedule |

**Score vector — BOS** (peer group: large FAA hubs)

| Component | Percentile | Raw | Weight |
|-----------|------------|-----|--------|
| Congestion | 88 pctl · large hub | 12.4M pax/runway/yr | 35 |
| Unmet flight demand | 81 pctl · large hub | +6.2 pp | 35 |
| Delay | 62 pctl · large hub | 14.8 min | 20 |
| Growth | 71 pctl · large hub | +8.4% | 10 |

Coverage 4 of 4.

**Assumptions & data gaps** (this answer, not a global footer)

- Weather delays excluded from the delay component.
- Percentiles are within the airport's FAA hub-size peer group, so a medium-hub 74th percentile is not equivalent to a large-hub 74th percentile.
- Missing delay data for HYA was not treated as zero; the airport is reported as partial inputs and has no composite.
- Construction cost, ROI, land availability, politics, and airline leases are outside this tool's scope.
