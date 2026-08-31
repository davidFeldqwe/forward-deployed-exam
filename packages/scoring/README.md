# @repo/scoring

The capacity-pressure screen. Pure module: it takes the committed snapshot as an
argument and returns numbers. No LLM, no network, no Convex — `tests/purity.test.ts`
reads every file in `src/` and fails the build if that stops being true.

```ts
import { loadSnapshot } from "@repo/snapshot";
import { queryAirports, scoreUniverse } from "@repo/scoring";

const scored = scoreUniverse(loadSnapshot());
queryAirports(scored, { region: "New England" });
// PVD 87 Strong candidate, BDL 58, PWM 51, BOS 50 — the national composite, filtered
```

## Score vector and composite

Four components, all pointing the same way: a higher raw value is more capacity
pressure.

| Component | Weight | Raw (2023–2024 snapshot) |
| --- | --- | --- |
| Congestion | 35 | enplanements per open runway |
| Unmet flight demand | 35 | points by which enplanement growth beats departure growth |
| Delay | 20 | arrival delay minutes per arrival, weather removed |
| Growth | 10 | percent change in enplanements across the window |

Weights are fixed, not a UI knob: constraint-relief outweighs growth.

**Percentile** — inside the airport's FAA hub-size peer group (large / medium /
small), computed nationally, once:

```
percentile = round(100 * (peers below + half the ties) / peers scored)
```

An airport alone in its peer group is the median of itself (50), not the top of
the country. Missing inputs are left out of the distribution, so one airport's
blank never moves its peers.

**Composite** — the weighted mean of those four integer percentiles, rounded, so
the vector an analyst expands is the vector the composite is built from. Santa
Ana's 77th percentile is a medium-hub rank and Los Angeles's 89th is a large-hub
rank; they are not comparable, and the module never pretends otherwise. The
composite inherits that: a national ranking sorts three peer groups into one
list, so small-hub PVD at 87 sits above large-hub BOS at 50 without claiming to
be under more pressure. Every row carries that caveat in `assumptions`.

## Candidate lamp

| Lamp | When |
| --- | --- |
| Strong candidate | composite ≥ 70, all four present |
| Mixed vector | 40 ≤ composite < 70, all four present |
| Weak candidate | composite < 40, all four present |
| Partial inputs | at least one component missing — composite is `null` |
| No data | no component present, or no composite available |

Missing is not a low score. A 3-of-4 row is never zero-filled and the remaining
components are never re-weighted; `candidateLamp` returns `Partial inputs` even
if it is handed a composite for such a row.

## queryAirports

Filters and sorts already-scored rows. It never re-percentiles: a region
question filters the national ranking, it does not rank New England against
itself.

- Filters: `iata` (one code or a list), `region`, `state`, `municipality`,
  `peerGroup`. Matching ignores case and padding and nothing else — place
  phrases are resolved to snapshot values before the call, so the screen never
  geocodes a guess. ORD and MDW are two Chicago rows; there is no city market.
- `sortBy`: one of `SORT_KEYS` — `composite` (default) or one component's
  percentile. Withheld composites sort last; ties keep the snapshot's order,
  which is enplanements descending. An off-list key throws a `RangeError` naming
  the accepted values rather than silently ranking on something else, because
  `sortBy` arrives from a query string or from the model, where the TypeScript
  type is no guard. Long-haul share is not a sort key.
- `limit`: default 10, hard cap 25. Passing `iata` lifts the default to the cap,
  so a two-code compare returns both rows.
- Returns `{ rows, matched, sortBy, limit }`; `matched` is the count before the
  limit. The row payload's key set is pinned by `tests/score.test.ts`, so the
  rank HTTP can assert its body equals the module output.

Every row carries `assumptions` and `gaps` for that answer — derived from the
snapshot's own methodology and gap list — because caveats belong on the answer,
not in a global footer.

## Tests

```sh
pnpm --filter @repo/scoring test
```

`tests/fixture.ts` is a ten-airport slice parsed with the real snapshot schema
and small enough to hand-compute: with five large hubs, a distinct value lands on
90 / 70 / 50 / 30 / 10, so `tests/score.test.ts` pins arithmetic a reader can
check on paper. It also carries the two coverage states the committed file does
not currently contain: MDW with no delay (Partial inputs) and HYA with no inputs
at all (No data). `tests/committed-snapshot.test.ts` pins real numbers off the
committed snapshot.
