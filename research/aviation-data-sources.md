# Aviation Data Sources for Top ~100 US Airport Investment Intelligence

Research date: 2026-08-31. Scope: identify free, no-waitlist sources covering the six metrics for the
top ~100 US commercial airports, to be baked into a committed data snapshot for a 24h exam build.

---

## 1. Recommendation

**Minimum viable source set (all free, no approval/waitlist, no login):**

| # | Source | What it gives |
|---|--------|----------------|
| A | **BTS T-100 Segment (All Carriers), domestic + international** — `https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FIM` | Scheduled/performed departures, seats, passengers, **distance** (route-level, so long-haul % is directly computable), by origin/dest airport, monthly |
| B | **BTS Reporting Carrier On-Time Performance** — `https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FGJ` | Delay/on-time metrics (departure/arrival delay minutes, cancellations, causes), monthly, per flight |
| C | **FAA CY Enplanements at Commercial Service Airports (ACAIS)** — `https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger` (annual xlsx, e.g. `arp-cy2024-commercial-service-enplanements.pdf` / preliminary CY2025 `.xlsx`) | Metric 1 (authoritative annual enplanements, ranks the top ~100 airports directly) |
| D | **OurAirports bulk CSVs** — `https://davidmegginson.github.io/ourairports-data/` (download page `https://ourairports.com/data/`) — `airports.csv` + `runways.csv` | Runway count (derive by counting rows per airport in runways.csv), IATA/ICAO/local codes, coordinates |
| E | **FAA ATADS / OPSNET (via ASPM public UI, no login)** — `https://www.aspm.faa.gov/opsnet/sys/airport.asp` | Cross-check / backfill on total operations counts per airport, especially for airports/years not well covered by T-100 (T-100 only covers certificated carriers' scheduled/charter ops, not GA/military ops at a tower) |
| F | **FAA Slot Administration Level 2/Level 3 pages** — `https://www.faa.gov/about/office_org/headquarters_offices/ato/service_units/systemops/perf_analysis/slot_administration/slot_administration_schedule_facilitation` | Metric 6, a short static list (~7 airports), hand-codeable into the snapshot |

**Ingest plan:**
1. Pull FAA ACAIS CY enplanements xlsx/pdf → rank airports, take top ~100 by enplanements → this becomes the master airport list (keyed by **LOC ID / IATA code** as printed in the FAA table).
2. Pull BTS T-100 Segment CSV (domestic + international, most recent full calendar year) filtered to origin/dest airports in the master list → aggregate `DepPerformed`, `Seats`, `Passengers`, and `Distance` per origin airport → gives operations counts (metric 2) and long-haul share via `Distance` buckets (metric 5, e.g. % of segments with Distance > 2000mi).
3. Pull BTS On-Time Performance CSV (same period) filtered to origin airports in the master list → aggregate average `ArrDelayMinutes`/`DepDelayMinutes`, cancellation rate, % flights >15min late → congestion proxy (metric 3).
4. Pull OurAirports `airports.csv` + `runways.csv` → join on IATA code (airports.csv `iata_code` field) → count of runway records per `ident` → runway count (metric 4, partial — no gate/terminal capacity available, see Gaps).
5. Hand-enter the FAA Level 2 (4 airports: ORD, LAX, EWR, SFO) and Level 3 (3 airports: JFK, LGA, DCA) list as a static lookup table joined by IATA code → metric 6.
6. Join key across all of the above: **IATA 3-letter code** is the practical join key (present in ACAIS, OurAirports, and derivable from BTS numeric `OriginAirportID`/`Origin` fields — BTS actually publishes the IATA-code-like "Origin" field directly alongside the internal numeric ID). See Section 4 for caveats (Chicago Midway vs O'Hare, small-airport code collisions, ICAO vs IATA for a few facilities).

This set fully covers metrics 1, 2, 3, 5, 6, and partially covers metric 4 (runway count only, no gate/capacity figure — see Gaps).

---

## 2. Metric coverage table

| Metric | Chosen source | Field name(s) | Confidence |
|---|---|---|---|
| 1. Passenger enplanements | FAA ACAIS CY Commercial Service Enplanements report | Airport, enplanements count (per calendar year, PDF/XLSX table) | Verified via search snippets showing live filenames (`arp-cy2024-commercial-service-enplanements.pdf`, preliminary CY2025 `.xlsx`); direct page fetch returned HTTP 403 (bot-blocked) — **field-level detail is unverified**, existence/URL is verified |
| 2. Flight operations (scheduled + actual) | BTS T-100 Segment (All Carriers) | `DepScheduled`, `DepPerformed`, `Seats`, `Passengers` | Verified (fetched field-reference page directly) |
| 2b. Total tower ops (cross-check, incl. GA) | FAA ATADS/OPSNET via ASPM public pages | "Airport Operations" report (IFR/VFR itinerant + local ops) | Unverified in detail — page structure confirmed via search, not directly fetched (403/redirect issues); publicly stated to need no login for finalized monthly data |
| 3. Delay / on-time performance | BTS Reporting Carrier On-Time Performance | `ArrDelayMinutes`, `DepDelayMinutes`, `Cancelled`, `CarrierDelay`, `WeatherDelay`, `NASDelay`, `SecurityDelay`, `LateAircraftDelay` | Verified (fetched field-reference page directly, confirmed dataset name "Reporting Carrier On-Time Performance (1987-present)", latest data June 2026) |
| 4. Runway count | OurAirports `runways.csv` (count rows per airport `ident`) | `airport_ident` (or equivalent), `length_ft`, `surface`, `le_ident`/`he_ident` (no single "runway_count" field — must be derived by counting rows) | Verified fields via data dictionary fetch; note the dictionary fetch did not show a literal `airport_ident` column name, so **exact join-column name in runways.csv is unverified** and should be checked against the actual CSV header at ingest time |
| 4. Gate/terminal capacity or declared hourly rate | **No free source found** | — | Gap — see Section 3 |
| 5. Route/distance (long-haul %) | BTS T-100 Segment | `Distance` (miles between origin/dest), `DistanceGroup` (500-mile buckets, confirmed present in T-100 Domestic Market field list, presumed also in Segment) | Verified (`Distance` field confirmed directly on T-100 Segment field-reference page) |
| 6. Slot-control / capacity constraint status | FAA Slot Administration — Level 2 and Level 3 airport pages | Static list: Level 2 = ORD, LAX, EWR, SFO; Level 3 = JFK, LGA, DCA | Partially verified — confirmed via WebSearch summary of FAA's own slot-administration page and corroborated by SimpleFlying secondary source; direct WebFetch of the FAA page returned HTTP 403, so the **exact current list should be re-confirmed at build time**, since these designations can change |

---

## 3. Gaps

- **Metric 4, gate/terminal capacity or declared hourly capacity rate: NO free, bulk-downloadable dataset was found.**
  - FAA's authoritative per-airport capacity figures (Annual Service Volume, declared hourly arrival/departure rates) live inside **ASPM** (Aviation System Performance Metrics), which **requires a login granted only "for a legitimate reason"** — this is exactly the kind of manual-approval gate the exam needs to avoid, so ASPM is disqualified for a 24h build (confirmed via search of FAA's own ASPM/ASPMHelp documentation: "ASPM is not publicly available. A login is required and can be requested with a legitimate reason.").
  - FAA Form 5010 (Airport Master Record) data — which does include number of based aircraft, and used to include some capacity-adjacent fields — has been **officially cancelled as forms (5010-1/2/3/5) as of July 25, 2024**, superseded by the ADIP (Airport Data and Information Portal) system. ADIP's public UI appears to support single-airport lookups and possibly per-facility Excel export ("Download Private Airport Report"), but no confirmed bulk CSV/API for all ~100 airports was found in this pass (unverified — ADIP fetch returned only partial content, no bulk download link surfaced).
  - **Proposed proxy:** runway count (from OurAirports, metric 4 above) combined with **enplanements per runway** (metric 1 ÷ runway count) as a rough congestion/capacity-pressure proxy, optionally weighted by the T-100 operations count per runway. This is a coarse stand-in — it does not capture terminal gate constraints, which is a materially different bottleneck than runway throughput, but it is the best free, unambiguous, no-login proxy available.

- **Metric 6 partial gap:** Level 2/Level 3 slot-control designation only flags 7 airports total. For the other ~93 airports in the top 100, there is no granular "capacity constraint" figure that is both free and unwaitlisted — the same runway-count/enplanements-per-runway proxy from the Metric 4 gap can double as a rough constraint signal for airports outside the slot-controlled 7.

- **ADIP / FAA NASR bulk data:** the FAA does publish a NASR (National Airspace System Resources) subscription with airport facility data including runway details, but this appeared only as a link reference ("View/Download Historical Aeronautical Information") in the ADIP fetch and was not independently verified in this pass; treat as **unverified** and a secondary candidate to re-check if OurAirports runway data proves insufficient.

---

## 4. Airport identity keys

This is the sharpest practical risk in joining these sources.

- **BTS (T-100, On-Time Performance, DB1B)** uses **two parallel identifiers** for each airport, confirmed directly from BTS's own field-reference pages:
  - `OriginAirportID` / `DestAirportID` — a numeric ID "assigned by US DOT" that is stable even if the 3-letter code changes.
  - `OriginAirportSeqID` / `DestAirportSeqID` — a **time-specific** ID that changes if the airport's characteristics change, used to track history.
  - A separate `Origin`/`Dest` field carries the familiar **3-letter IATA-style code** (e.g. ORD, ATL). This is the field you'd actually join on in practice, but be aware BTS's "IATA-style" code is not always identical to the true IATA code (it is DOT's own code assignment, which usually — but not always — matches IATA).
- **FAA ACAIS enplanement reports** identify airports by **LOC ID** (FAA's own 3-4 character location identifier) plus airport name and city — this is usually but not always the same string as the IATA code (e.g. most large hubs match, e.g. ATL, ORD, LAX; mismatches are common at smaller GA-heavy fields and at military-joint-use fields where FAA LID differs from IATA).
- **OurAirports** (`airports.csv`) carries **both** `iata_code` and `icao_code` as separate columns plus its own internal `ident` (which for US airports is typically the ICAO code, e.g. `KATL`, not the IATA code `ATL`) — confirmed via data-dictionary fetch.
- **OpenFlights** (if used at all) keys on IATA and ICAO both, in `airports.dat`, but the dataset is a stale, sporadically-updated snapshot (route data frozen since ~2014 per third-party analysis) — not recommended as primary, only as a fallback lookup table for airport name/lat-long.
- **FAA slot administration pages** refer to airports by common name and IATA code informally (ORD, LAX, EWR, SFO, JFK, LGA, DCA) — no formal ID scheme, easy to hand-map.

**Concrete disagreement examples to watch for:**
- Chicago has two commercial airports, ORD (O'Hare) and MDW (Midway) — both must be kept distinct across every source; a naive "Chicago" city-level join (which BTS's `OriginCityMarketID` groups by, not by individual airport) would incorrectly merge them.
- Washington DC area has three: DCA (Reagan National, Level 3 slot-controlled), IAD (Dulles), BWI (Baltimore) — same city-market trap.
- ICAO vs IATA prefix mismatch: OurAirports' `ident` for US airports is the 4-letter ICAO code (`K`-prefixed, e.g. `KJFK`), so a join against BTS/FAA IATA codes (`JFK`) requires using OurAirports' separate `iata_code` column, not `ident`.

**Recommendation:** build the master airport list from **FAA ACAIS enplanements (LOC ID / IATA code)**, and join every other source onto that list using each source's **IATA code column** specifically (BTS `Origin`/`Dest`, OurAirports `iata_code`) — never join on the BTS numeric `AirportID`, OurAirports `ident`, or city name, since those differ in format across sources.

---

## 5. Per-source detail

### A. BTS T-100 Segment (All Carriers) — Domestic + International
- **URL:** `https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FIM` (download form); field reference verified at `https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FIM`
- **Access method:** Web form → bulk CSV export (comma-delimited), one file per month/table selected. No REST API found (confirmed: the T-100 database-info page only exposes a "View tables" browsing link, no API doc).
- **Auth:** None.
- **Rate limits:** N/A (manual form-based export); practical limit is file size per request.
- **Update cadence / latest period:** Monthly; public segment tables available roughly two months after month-end (final/international data lags longer) — per WebSearch of BTS's own guidance.
- **Coverage of top ~100 airports:** Complete for any airport served by a certificated carrier reporting Form T-100 (i.e., effectively all top-100 commercial airports).
- **Licence/terms:** US government public data; no explicit licence text located in this pass (unverified) but treated as public domain per standard federal data practice.
- **Fields → metrics:** `DepScheduled`, `DepPerformed` → metric 2; `Distance` → metric 5; `Seats`, `Passengers` → supplementary capacity/traffic context; `OriginAirportID`/`DestAirportID` (numeric) plus `Origin`/`Dest` (code) → join keys.
- **Confidence:** Verified (field list fetched directly from BTS's own field-reference page).

### B. BTS Reporting Carrier On-Time Performance (1987–present)
- **URL:** `https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FGJ`; field reference verified at `https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FGJ`
- **Access method:** Bulk CSV export via web form.
- **Auth:** None mentioned/found.
- **Rate limits:** N/A (form-based).
- **Update cadence / latest period:** Monthly; page stated "Latest Available Data: June 2026" at fetch time.
- **Coverage:** Reporting carriers = those with ≥1% of domestic scheduled passenger revenue — this covers essentially all top-100-by-enplanement airports since all major/regional carriers serving them report.
- **Licence/terms:** Not explicitly stated on fetched page (unverified); standard US federal public data.
- **Fields → metrics:** Delay-cause and delay-minute fields, cancellation/diversion fields → metric 3. Also carries `Distance`, `OriginAirportID`, flight date fields usable as secondary corroboration for metrics 2 and 5.
- **Confidence:** Verified (fetched directly).

### C. FAA ACAIS — CY Enplanements at Commercial Service Airports
- **URL:** landing page `https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger` (returned HTTP 403 to WebFetch, likely bot-blocking); specific files located via search: `https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/arp-cy2024-commercial-service-enplanements.pdf` and `https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/arp-cy2025-commercial-service-enplanements-preliminary.xlsx`
- **Access method:** Static PDF/XLSX bulk download per calendar year (not an API).
- **Auth:** None apparent.
- **Rate limits:** N/A.
- **Update cadence / latest period:** Annual; per search snippets, CY2024 final released Sept 15 2025, CY2025 preliminary available June 2026, CY2025 final expected "late August 2026."
- **Coverage:** Complete for all FAA-defined "commercial service" airports (by definition, the population this exam wants).
- **File size:** Unverified/estimate — these are per-year summary tables (one row per airport), almost certainly well under 1 MB for the XLSX, low single-digit MB at most for the PDF given for ~500 airports listed.
- **Licence/terms:** Not verified directly (page blocked); standard US federal public data expected.
- **Fields → metrics:** Enplanement count per airport per year → metric 1 directly.
- **Confidence:** Existence/URL verified via search snippets showing live filenames; field-level and licence detail unverified (direct fetch blocked, HTTP 403).

### D. OurAirports bulk CSVs
- **URL:** download page `https://ourairports.com/data/`; actual files served from `https://davidmegginson.github.io/ourairports-data/` per the site's own description (GitHub-hosted).
- **Access method:** Bulk CSV, 6 files (`airports.csv` ~12.7MB, `airport-frequencies.csv` ~1.3MB, `airport-comments.csv` ~4.7MB, `runways.csv` ~4.0MB, `navaids.csv` ~1.5MB, `countries.csv`/`regions.csv` small) — sizes as stated on the page (not independently re-measured, treat as page-stated, likely accurate).
- **Auth:** None.
- **Rate limits:** N/A (static file host).
- **Update cadence:** Nightly, per page.
- **Coverage:** Global, includes all US airports (large/medium/small/closed/heliport/etc. typed) — complete coverage of top-100 US commercial airports expected, though not independently confirmed row-by-row.
- **Licence:** Public Domain, explicitly stated on the page ("released to the Public Domain, and comes with no guarantee of accuracy or fitness for use").
- **Fields → metrics:** `iata_code`, `icao_code`, `type`, `iso_country`, lat/long → join keys and airport metadata; `runways.csv` rows counted per airport → metric 4 (runway count, derived, not a native field).
- **Confidence:** Verified (data dictionary fetched directly), except the exact runway-to-airport join column name in `runways.csv` (likely `airport_ident` or `airport_ref`, standard OurAirports schema) which was **not directly confirmed** in this pass — verify against the live CSV header before ingest.

### E. FAA ATADS / OPSNET (via ASPM public pages, NOT the login-gated ASPM proper)
- **URL:** `https://www.aspm.faa.gov/opsnet/sys/airport.asp` (Airport Operations report), `https://aspmhelp.faa.gov/index/Operations_Network_(OPSNET).html` (docs)
- **Access method:** Web-form-generated HTML report ("CountOps"/OPSNET query tool); described as downloadable, but exact export format (CSV vs HTML table only) was **not directly confirmed** — WebFetch of these URLs was not completed successfully in this pass (search-derived only).
- **Auth:** Per WebSearch summary of FAA's own docs: "to access next day OPSNET data, users require a login, while without a login, users can access finalized OPSNET Operations and Delay data for each month on the 20th of the next month" — i.e., **no login needed for finalized historical data**, only for near-real-time next-day data. This distinguishes OPSNET from full ASPM (which is login-gated entirely).
- **Rate limits:** Unknown/unverified.
- **Update cadence / latest period:** Daily operations data from FY1990–present (with the ~20-day publication lag noted above); daily delay data from FY2000–present.
- **Coverage:** All FAA-towered airports (2,000+ facilities per CountOps docs) — complete for top-100.
- **Licence/terms:** Unverified in this pass.
- **Fields → metrics:** IFR/VFR itinerant + local operations counts → metric 2 (cross-check/backfill against T-100, since T-100 only captures certificated-carrier scheduled/charter service, not GA/military/air-taxi ops that also load the runway system).
- **Confidence:** Unverified in detail — recommend a direct fetch/verification pass before committing to this as an ingest source, since the exact export mechanism (CSV vs HTML-only) was not confirmed.

### F. FAA Slot Administration — Level 2 / Level 3 airports
- **URL:** `https://www.faa.gov/about/office_org/headquarters_offices/ato/service_units/systemops/perf_analysis/slot_administration/slot_administration_schedule_facilitation` (index), with sub-pages `.../level-2-airports` and `.../level-3-airports`
- **Access method:** Static HTML list page (not a dataset/API) — small enough to hand-transcribe into the snapshot (7 airports total).
- **Auth:** None.
- **Rate limits:** N/A.
- **Update cadence:** Changes rarely; last confirmed list (per WebSearch of FAA's own page and corroborating SimpleFlying article): Level 2 = ORD, LAX, EWR, SFO; Level 3 = JFK, LGA, DCA.
- **Coverage:** Only 7 of ~100 airports carry an explicit designation; absence of designation for the other ~93 should be encoded as "not slot-controlled," not as missing data.
- **Licence/terms:** US government page, no special licence expected.
- **Fields → metrics:** Binary/categorical designation (Level 2 / Level 3 / none) → metric 6.
- **Confidence:** Partially verified — WebFetch of the FAA page itself returned HTTP 403 in this pass; the specific list is corroborated by a WebSearch summary that explicitly names the FAA page plus an independent secondary source (SimpleFlying). Re-verify by direct fetch before finalizing the snapshot, since these lists can change (e.g. historically DCA/JFK/LGA/ORD designations have shifted over the decades).

---

## Rejected / lower-priority candidates and why

- **FAA ASPM (Aviation System Performance Metrics), full system** — `https://aspm.faa.gov/` — **REJECTED**: confirmed via FAA's own ASPMHelp documentation that "ASPM is not publicly available. A login is required and can be requested with a legitimate reason." This is exactly the manual-approval gate the exam wants to avoid. (The narrower OPSNET/ATADS reports, item E above, are a login-free subset and are kept.)
- **FAA Form 5010 (Airport Master Record)** — **REJECTED as a live source**: confirmed via search of FAA's own forms library that Forms 5010-1, 5010-2, 5010-3, and 5010-5 were **cancelled July 25, 2024**, superseded by ADIP. ADIP's bulk-download capability for all ~100 airports was not confirmed in this pass (partial fetch only showed a single-airport "Download Private Airport Report" and a link to NASR historical data) — treat as unverified/secondary, worth a follow-up check but not the primary plan.
- **FAA ACAIS "all enplanements" (all airports, not just commercial service)** — same site as source C; not separately needed since the exam only needs the top ~100, which are all in the "commercial service" subset.
- **OpenFlights (`airports.dat`, `routes.dat`)** — **DOWNGRADED to fallback-only**: per third-party analysis found via WebSearch, "the OpenFlights airports database data is a snapshot from the mid-2010s and its route data has been frozen since 2014," and the GitHub mirror is only "a sporadically updated static snapshot." OurAirports is the actively-maintained, nightly-updated superset for airport metadata; OpenFlights route data is too stale to trust for metric 5 when BTS T-100 gives authoritative, current, US-specific route/distance data anyway.
- **OpenSky Network** — `https://opensky-network.org/api`, REST API, confirmed endpoints `/states/all`, `/flights/arrival`, `/flights/departure`, `/tracks`. **Not selected as a primary metric source** because: (a) anonymous tier is capped at 400 credits/day and flight-history queries cost 4-960 credits each depending on date range, making a full 100-airport historical pull impractical in a free anonymous tier within 24h; (b) it gives ADS-B-derived flight counts, which is a redundant, noisier version of what BTS T-100/OPSNET already give authoritatively for US airports. Kept as a documented option only if a real-time/live-tracking demo feature is wanted later — not needed for the six committed-snapshot metrics. Auth: OAuth2 client-credentials, anonymous access allowed for `/states/all` only, free registration unlocks 4,000-14,400 credits/day (no manual approval step noted, so it is technically usable, just not preferred).
- **AviationStack** — free tier confirmed at 100 requests/month (per WebSearch of pricing pages) — **REJECTED**: too low a quota to cover ~100 airports with any meaningful field set, paid tiers start at $49.99/month.
- **AeroDataBox** — free "Basic" tier confirmed at 600 API units/month, with per-endpoint costs of 1-6 units — **REJECTED as primary** but technically usable in principle for a very small, targeted pull (e.g. static airport metadata only); redundant with OurAirports which is unlimited and free.
- **Aviation Edge** — confirmed via WebSearch: **no free tier at all** — REJECTED outright (paid-only).
- **Wikipedia / Wikidata** — `https://en.wikipedia.org/wiki/List_of_the_busiest_airports_in_the_United_States` — confirmed to exist and list rank/airport/city/state/IATA/ICAO/passenger-count columns, but **not selected as primary** since it is a secondary aggregation of the same FAA ACAIS figures with unclear per-row sourcing/citation freshness (not independently verified in this pass which underlying source-year each row cites). Reasonable last-resort fallback only if the FAA ACAIS file itself is unreachable at build time (note: FAA page returned HTTP 403 to automated fetch during this research pass, so a fallback plan is worth having, e.g. scraping this Wikipedia table as a backup path for metric 1 if the FAA xlsx download is also blocked at build time).
- **BTS Airport Snapshot / Carrier Snapshot tools** (seen referenced on the TranStats homepage) — not independently investigated in this pass; likely just a UI wrapper over the same T-100/OTP data already selected. Not needed as a separate source.
