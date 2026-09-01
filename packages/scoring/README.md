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
small / nonhub), computed nationally, once:

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
composite inherits that: a national ranking sorts four peer groups into one
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

- Filters: `iata` (one code or a list) and the four `PLACE_FIELDS` — `region`,
  `state`, `municipality`, `peerGroup`. Matching ignores case and padding and
  nothing else — place phrases are resolved to snapshot values before the call,
  so the screen never geocodes a guess. ORD and MDW are two Chicago rows; there
  is no city market.
- `sortBy`: one of `SORT_KEYS` — `composite` (default) or one component's
  percentile. Withheld composites sort last; ties keep the snapshot's order,
  which is enplanements descending. An off-list key throws a `RangeError` naming
  the accepted values rather than silently ranking on something else, because
  `sortBy` arrives from a query string or from the model, where the TypeScript
  type is no guard. Long-haul share is not a sort key.
- `metric`: one of `LOOKUP_METRICS` — the four components, plus `longHaulShare`,
  which is a lookup and so is here rather than in `SORT_KEYS`. It asks for one
  number per airport instead of a ranking (story 30) and orders the rows by that
  raw number, so the order read is the order of the column shown; `sortBy` is
  therefore null on a lookup and `metric` is null on a ranking. The rows are
  unchanged — a row is one shape, checked once — so a lookup still carries a
  composite and a lamp that the answer objects withhold: a lookup is not an
  investment recommendation. `metricValue(row, metric)` reads the number, so the
  column and the sort cannot disagree about which field a metric lives in.
- `limit`: default 10, hard cap 25. Passing `iata` lifts the default to the cap,
  so a two-code compare returns both rows. A limit below 1 is raised to 1 and a
  fraction truncates, so a stray number narrows the answer rather than emptying
  it; one that is not a finite number falls back to the default.
- Every argument is optional, and `null` means the same as leaving it out:
  `searchParams.get` returns `null` for a query parameter nobody passed, and a
  model omits a tool field by sending `null` as often as by dropping it, so
  neither is allowed to crash a filter or refuse a sort key. An empty string is
  not the same thing — it is a place phrase or a sort key that was supplied and
  resolves to nothing. Values of the wrong *type* stay the caller's problem: the
  tool schema and the query-string parser validate those (a `limit` of `"3"` is
  not a number and falls back to the default).
- Returns `{ rows, matched, resolvedIata, sortBy, metric, limit, unknownIata,
  unknownPlace }`. `resolvedIata` is every matched code in the order `rows` pages
  — the resolved airport set the agent names before it ranks, so a twelve-airport
  state does not come back as the ten `rows` held. `matched` is
  `resolvedIata.length`, so the count and the set cannot disagree. `unknownIata`
  lists requested codes with no airport in the scored universe, in the order
  asked: "LAX vs IAN" comes back as one row, and the caller has to be able to tell
  that from a compare that returned both. `unknownPlace` does the same for a place
  filter, in `PLACE_FIELDS` order: `state: "California"` matches nothing because
  the snapshot spells a state as two letters, and an empty ranking with no other
  signal reads as "no airport in California is a candidate" while LAX and SNA sit
  in the screen. Both mean *outside the universe*, not *filtered out* — New
  England and CA are real places even though no airport is in both, and a code the
  place filters excluded is not listed either. Neither refuses the query the way
  an off-list `sortBy` does: an unresolved place legitimately has no airports, so
  zero rows is the honest answer, it just has to be distinguishable.
  `placeVocabulary(scored)` is the other half of that refusal: the values each
  place filter accepts, sorted, derived from the universe rather than kept by hand
  in the app, so "accepted phrases" cannot disagree with what is filtered on. A
  blank is not offered — SJU has no Census division, and a region ranking never
  returns it. Both key sets, the row's and the result's, are pinned by tests, and
  so is the fact that the result survives `JSON.parse(JSON.stringify(...))`
  unchanged, so the rank HTTP can assert its body equals the module output.

`sharedAssumptions(snapshot)` is the snapshot-wide half of those caveats on its
own, for the agent's `describeMethodology`: the tool that says how the screen
works states it in the same sentences the rows carry, rather than a second
wording of one screen that can drift from it.

Every row also carries the snapshot's `latitude` and `longitude`: the OurAirports
pair, passed through untouched so a thread can place a resolved airport set
without a second lookup at query time. This module never computes on them — a
coordinate is not a score — and they are null only as a pair, so an airport the
source does not locate is still ranked rather than placed at 0, 0.

Every row carries `assumptions` and `gaps` for that answer — derived from the
snapshot's own methodology and gap list — because caveats belong on the answer,
not in a global footer.

## isScoredAirport

`isScoredAirport(value)` answers "is this JSON one of the rows above" for a
caller holding a row this process did not score: the Thread store reads a
persisted answer back, and the message list is the only thing that answer
re-renders from, so a row that lost its lamp or its name has to fail the read
rather than draw a blank cell. The check is here because the shape is here — a
store that listed the fields itself is a second copy of `ScoredAirport`, free to
drift and free to be stricter than the snapshot. `region` is null for a territory
the Census Bureau files under no division (SJU), a coordinate is still refused
when only half of it is there, and the closed label sets — hub size, slot level,
coverage, the five lamps — are typed over the row's own unions, so a value added
to one fails the typecheck here instead of being refused at a boundary that never
heard of it.

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
