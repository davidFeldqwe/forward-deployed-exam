# @repo/snapshot

The committed capacity-pressure snapshot: the top 100 US airports by FAA ACAIS
enplanements, keyed by **IATA**. A fresh clone reads
`data/us-airports-snapshot.json` and needs no live FAA or BTS download.

```ts
import { loadSnapshot } from "@repo/snapshot";

const snapshot = loadSnapshot(); // Zod-validated, throws on drift
```

## Comparison window

`2023–2024` — the latest two calendar years with *final* FAA enplanements at
ingest, written into the file as `comparisonWindow`. The CY2025 release was still
preliminary on 2026-08-31, so it is out of the window. Every airport is measured
on the same pair; `asOf` plus those years is the snapshot vintage.

## What each airport carries

| Field | Meaning |
| --- | --- |
| `iata`, `name` | identity; the join key is IATA, never a BTS city market or an OurAirports ident |
| `municipality`, `state`, `region` | place; `region` is one of the nine US Census divisions, null for territories |
| `peerGroup` | FAA hub size: large, medium, small |
| `inputs` | the four score-vector inputs, each with `raw` and `coverage` |
| `enplanements`, `flights` | the window measures the inputs are computed from |
| `runwayCount`, `slotLimit`, `longHaulShare` | lookups and why-labels, not score-vector slots |

Missing is never zero: an absent input keeps `raw: null` and
`coverage: "missing"` so scoring can withhold the composite.

## Sources

| Source | Gives |
| --- | --- |
| FAA ACAIS calendar-year enplanements | universe, peer group, both window years of enplanements |
| BTS Reporting Carrier On-Time Performance (24 monthly files) | departures, arrival delay minutes, weather delay, long-haul departures |
| OurAirports `airports.csv` + `runways.csv` | name, municipality, open runway count |
| FAA slot administration | Level 2 ORD, LAX, EWR, SFO; Level 3 JFK, LGA, DCA — hand-coded in `src/slot-limits.ts`, re-read at each ingest |

`gaps` in the snapshot names what the sources do not cover (gate capacity,
international long-haul, non-reporting carriers, territories without a division).

## Rebuilding (optional)

```sh
pnpm --filter @repo/snapshot ingest
```

Downloads roughly 700 MB of BTS monthly files into `.cache/` (override with
`INGEST_CACHE_DIR`) and rewrites the snapshot; a second run reuses the cache.
This is a deliberate manual step, not CI: the committed file is the contract.
