# DESIGN

How the capacity-pressure screen is built, and where the line between code and
the model falls. Vocabulary is `CONTEXT.md`; the product handoff is `PRD.md`.
This document describes the repo as it stands, including what is not built yet
(see [Known gaps](#known-gaps)).

## Thesis

An analyst screening US airports for a terminal-renovation investment wants to
know where new capacity would be used. The screen answers that with a **hybrid
thesis**:

- **Constraint-relief is the main reason.** An airport at a capacity wall — many
  passengers per runway, flights not keeping up with passengers, delay on the
  ground — has demand it cannot serve. Terminal capacity there has somewhere to
  go.
- **Growth without a wall is a weaker reason.** Rising passengers matter, but an
  airport with room to absorb them does not need a renovation to serve them.

So the score vector carries both, and constraint-relief is weighted above growth.
The output is a ranked list of **renovation-investment candidates**, not a deal
screen: construction cost, ROI, land, politics, and airline leases are not
inputs, are not modelled, and are refused as questions. The screen says *where
capacity pressure is*, and an analyst decides what that is worth.

Every number an answer shows is computed by `packages/scoring` from a committed
file. The pipeline is one direction:

```
FAA + BTS + OurAirports  ->  ingest (manual)  ->  committed snapshot JSON
committed snapshot  ->  scoreUniverse  ->  queryAirports  ->  answer objects
```

## Weights and the composite

Four components, all pointing the same way: a higher raw value is more capacity
pressure. Weights are fixed in `packages/scoring/src/weights.ts` and are not a
UI knob — a weight slider would let a reader tune the screen until it agreed
with them.

| Component | Weight | Raw measure (2023–2024 window) |
| --- | --- | --- |
| Congestion | 35 | enplanements per open runway in the second year |
| Unmet flight demand | 35 | percentage points by which enplanement growth exceeds departure growth |
| Delay | 20 | arrival delay minutes per arrival, weather delay removed |
| Growth | 10 | percent change in enplanements across the window |

Congestion and unmet flight demand are constraint-relief and together carry 70 of
100; growth carries 10.

**Percentile, then composite.** Each raw value becomes a percentile *within the
airport's FAA hub-size peer group* (large / medium / small), computed nationally,
once:

```
percentile = round(100 * (peers below + half the ties) / peers scored)
```

The composite is the weighted mean of those four integer percentiles, rounded.
Two consequences the answer objects state rather than hide:

- A percentile is peer-relative. Santa Ana's 77th is a medium-hub rank and Los
  Angeles's 89th is a large-hub rank; they are not comparable, and neither are the
  composites built from them.
- A place question **filters** the national ranking; it never re-percentiles.
  Asking about New England ranks four airports against the whole country, not
  against each other, so the answer does not invent a regional leader.

Missing is not zero. A component with no input keeps `raw: null` and
`coverage: "missing"`, is left out of its peer distribution, and withholds the
composite: no zero-fill, no re-weighting of the three components that are there,
no 3-of-4 number.

### Candidate lamp

| Lamp | When | Composite shown |
| --- | --- | --- |
| Strong candidate | composite ≥ 70, all four components present | yes |
| Mixed vector | 40 ≤ composite < 70, all four present | yes |
| Weak candidate | composite < 40, all four present | yes |
| Partial inputs | at least one component missing | withheld (`—`) |
| No data | no component present | withheld (`—`) |

The lamp is always text. Ranking rows carry hue beside the words — Strong green,
Mixed yellow, Weak red — and a legend names all five; Partial inputs and No data
are never red, because a missing input is not a low score.

## Join key: IATA

Airports are joined on the **IATA code**, and only on that.

- Never BTS `CityMarketID`: that is a metro grouping. It would merge ORD with MDW
  and LAX with SNA, which is exactly the answer an analyst must not get — two
  airports in one market have separate terminals, separate runways, and separate
  investment cases.
- Never the BTS numeric airport id or the OurAirports `ident`: neither appears in
  the FAA enplanement release, so joining on them would need a second crosswalk
  that can silently mismatch.

The snapshot writes its own `joinKey`, and ingest refuses to write a file whose
sources disagree: a slot-limited code must exist in the universe, and an
OurAirports place must sit in the state the FAA file gives the airport, so a
reassigned code fails the ingest instead of attaching the wrong city.

## The LLM boundary

The model runs the conversation. Code runs the screen.

| The model may | Code owns |
| --- | --- |
| read a question and decide which tool to call | every number, percentile, composite, lamp, and sort order |
| map a place phrase ("Pacific Northwest") to states or codes it passes as tool arguments | which airports a filter matches, and the resolved airport set it returns |
| refuse an off-thesis or unresolvable question, and write the prose around an answer | the ranking table, score vector, and resolved-set line, all rendered from the tool payload |

The agent gets exactly two tools, and no third is coming:

- `queryAirports` — the only path to airport numbers. Filters (`iata`, `region`,
  `state`, `municipality`, `peerGroup`), one sort key, a limit capped at 25.
- `describeMethodology` — weights, comparison window, peer-group rule, long-haul
  cutoff, and the stated gaps. It ranks nothing.

Place resolution is **data**, not a tool: the codes come back inside the query
result, so the answer can name the resolved airport set before it ranks. An
ambiguous or unknown phrase is refused with the accepted vocabulary — the screen
never geocodes a guess.

Three things keep that boundary checkable rather than merely claimed:

- `packages/scoring` imports no LLM SDK, no network, and no Convex.
  `packages/scoring/tests/purity.test.ts` walks every file under `src/` and fails
  the build if one appears.
- The vendor SDK is imported in exactly one module, `apps/web/app/agent-model.ts`.
  `apps/web/app/agent-boundary.test.ts` fails the build if a second module
  imports one, so the whole LLM edge is one file a reviewer can read.
- A tool payload is stored with the message and re-rendered on refresh, so the
  numbers in an old thread are the numbers the tool returned, not prose a model
  re-typed.

Provider choice is `ANTHROPIC_API_KEY` first, then `OPENAI_API_KEY` (see
`README.md`); tool steps are capped at eight. With neither key the app stores the
question and says it has no model — the screen, its tests, and CI still run.

## Snapshot vintage

`packages/snapshot/data/us-airports-snapshot.json` is the committed universe: the
top 100 US airports by FAA ACAIS enplanements, Zod-validated on load, ingested
2026-08-31.

**Comparison window: 2023–2024** — the latest two calendar years with *final*
FAA enplanements at ingest. CY2025 was still preliminary, so it is out. Every
airport is measured on the same two years, and the chrome and
`describeMethodology` name them, so no row is quietly newer than another.

| Source | Gives |
| --- | --- |
| FAA ACAIS calendar-year enplanements (CY2024 final, CY2023 comparative) | the universe, hub-size peer group, both years of enplanements |
| BTS Reporting Carrier On-Time Performance, 2023-01 through 2024-12 | departures, arrival delay minutes, weather delay, long-haul departures |
| OurAirports `airports.csv` + `runways.csv` | name, municipality, state, coordinates, open runway count |
| FAA slot administration | Level 2 ORD, LAX, EWR, SFO; Level 3 JFK, LGA, DCA — hand-coded, re-read at ingest |

A fresh clone makes no aviation request: not at install, not in the tests, not
when the agent answers. Rebuilding the file is a manual `pnpm --filter
@repo/snapshot ingest` (~700 MB of BTS monthlies) and is deliberately not wired
into CI — the committed file is the contract, and re-ingesting is what changes
the vintage.

## Known gaps

What the data does not cover. These ride on every answer as `gaps`, so they are
read with the ranking rather than in a footer:

- No free source publishes gate or terminal capacity, so congestion uses enplanements per open runway; FAA ASPM declared rates are login-gated.
- Long-haul share counts BTS domestic reporting-carrier departures over 2,000 miles. International long-haul is out of scope because T-100 Segment has no stable bulk download.
- Departure counts and delay minutes cover BTS reporting carriers only, so unmet flight demand omits carriers under the 1% revenue reporting threshold.
- Territories have no US Census division, so their region is null and they never appear in a division ranking.
- FAA CY2025 enplanements were still preliminary at ingest, so the comparison window is the latest two final calendar years.

Two more that are true of the screen rather than the sources:

- **No live aviation HTTP at query time, by design.** An answer is as fresh as the
  committed snapshot and no fresher. The fix is a re-ingest, not a fetch.
- **Congestion is a proxy.** Enplanements per open runway is airside pressure
  standing in for terminal pressure. An airport with runways to spare and a full
  terminal is under-scored by this screen, and no free field would fix it.

What the build has not landed yet:

- **LLM-free rank HTTP** (curlable rank / one IATA / compare two IATAs) is not
  built. The equivalence test that pins an HTTP body to the module output arrives
  with it; today the module output itself is pinned, including its key order, and
  is asserted to survive a JSON round trip so that route can only agree with it.
- **Convex** is not provisioned. Auth and Threads are in-process, so a thread
  survives a refresh but not a restart. Airports and scores stay in files
  whatever happens to Convex.
