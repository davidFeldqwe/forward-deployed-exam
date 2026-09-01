# PRD — Airport Investment Intelligence

Handoff for a build session. Vocabulary is `CONTEXT.md`. Answer-shape lock is [Prototype the answer shape and chat UI](https://github.com/davidFeldqwe/forward-deployed-exam/issues/10). Do not relitigate those.

## Problem Statement

An analyst screening US airports for terminal-renovation investment needs ranked, explained, number-backed answers. They will not trust prose that does not show its work. Today there is no product: no signed-in place to ask, no deterministic capacity-pressure screen they can inspect, and no way to come back to a thread.

The exam (and the analyst) grades clarity of thesis, a visible code/LLM boundary, and a screen that does not pretend to be deal economics.

## Solution

A signed-in chat agent over a committed snapshot of every US primary commercial airport.

- Signed-out people see a dark **Landing** (screenshot layout, zip palette). Chat is gated.
- Convex Auth (email + password, open signup). Google or GitHub only if time remains.
- Convex stores **Threads**. Snapshot and scoring stay files/modules. The LLM never invents a number or a ranking.
- Signed-in chat is the zip column: inspectable tools, **resolved airport set** before rank, **score vector**, **candidate lamp**, **carried context**.

## User Stories

1. As a visitor, I want a landing that states the capacity-pressure screen in one sentence, so that I know this is not a consumer chatbot.
2. As a visitor, I want a shared site header that stays on screen — identity on the left, chat, GitHub and a profile control that reaches Sign in on the right — plus Start asking in the hero, so that I can reach an account without hunting.
3. As a visitor, I want suggested-question cards that use glossary language (renovation-investment candidate, New England, compare two airports), so that I see what the agent actually answers.
4. As a visitor, I want a How it works strip (ingest → snapshot → tools → answer objects), so that I understand numbers come from code.
5. As a visitor, I want a Built on row for Next.js, Convex, Vercel AI SDK, and Anthropic, so that the stack on the page matches the repo.
6. As a visitor, I want the Landing header to offer **Map** — the one 3D surface we do ship (amended by [public /map](https://github.com/davidFeldqwe/forward-deployed-exam/issues/68)) — and no Chat-as-public-demo or logos for FastAPI / LangGraph / Neon / Clerk, so that the landing advertises only surfaces that exist.
7. As a visitor, I want the landing in the dark zip palette, so that it matches the signed-in agent.
8. As a visitor, I want GitHub in the site header on both surfaces, and still in the Landing footer, pointing at this repo, so that a reviewer can open the source.
9. As a visitor, I want /chat to send me to /login, so that the agent is not a guest toy.
10. As a visitor, I want question cards to remember the prompt across login, so that after I sign up the composer is prefilled (or the question is sent) in a new thread.
11. As a new user, I want email + password signup on /login, so that I can get in without provisioning OAuth apps.
12. As a returning user, I want email + password sign-in on the same /login page, so that I am not sent through a second product.
13. As a user, I want open signup, so that a reviewer is not blocked on an invite list.
14. As a user, I want Google or GitHub sign-in if the build still has time, so that I can skip a password — this is stretch, not a blocker.
15. As a signed-in analyst, I want `/` to take me to chat (last thread, or empty if none), so that I am not shown the brochure again.
16. As a signed-in analyst, I want Sign out from the header's profile control to ask for confirmation first, so that an accidental click on a shared machine does not end the session.
17. As a signed-in analyst, I want a left thread rail listing my threads by first user question, so that I can reopen work without leaving the transcript.
18. As a signed-in analyst, I want New thread at the top of that rail, so that a new question does not append to an old ranking.
19. As a signed-in analyst, I want threads to survive refresh, so that Convex ownership is real.
20. As a signed-in analyst, I want empty chat to be a blank transcript plus the same prompt chips as the landing, with no thesis paragraph, so that the zip empty state still holds.
21. As an analyst, I want to ask which airports in a Census division are renovation-investment candidates, so that I get a filtered national composite, not a local re-percentile.
22. As an analyst, I want the agent to name the **resolved airport set** before it ranks, so that I can see which airports the place phrase became.
23. As an analyst, I want a ranking row with IATA, name, composite 0–100, **candidate lamp**, and why-labels, so that I can scan without reading prose first.
24. As an analyst, I want the score vector collapsed on a row and expandable in place, so that I can open the numbers without leaving the ranking.
25. As an analyst, I want percentile bars grey and indigo reserved for send, focus, and links, so that hue is not pretending to be a grade.
26. As an analyst, I want Strong candidate / Mixed vector / Weak candidate as text pills with hue, never hue alone, so that the lamp is readable.
27. As an analyst, I want Partial inputs and No data with no red, and composite shown as —, so that missing is not a low score.
28. As an analyst, I want compare questions (Los Angeles vs Santa Ana) to keep LAX and SNA as separate rows, so that a city market never merges them.
29. As an analyst, I want “the second one” to show **carried context** before the vector, so that I can see how the follow-up was resolved.
30. As an analyst, I want a single-metric lookup (long-haul share, delay minutes) with no lamp, so that a lookup is not dressed as an investment recommendation.
31. As an analyst, I want off-thesis questions (cost, ROI, land, politics, leases) refused, with what the screen will and will not answer, so that I do not think the model ran a deal screen.
32. As an analyst, I want an unknown place phrase refused, with accepted phrases (IATA, municipality, state, nine Census divisions), so that the agent does not geocode a guess.
33. As an analyst, I want inspectable `queryAirports` and `describeMethodology` rows, collapsed by default, so that I can see arguments and results without trusting prose.
34. As an analyst, I want assumptions and data gaps attached to that answer, so that caveats are not a global footer.
35. As an analyst, I want streaming to show a pending row with no scores yet, so that I never see a half-composite.
36. As an analyst, I want the comparison window named in chrome, so that every airport is on the same two years.
37. As a reviewer, I want a fresh clone to run without live aviation downloads, so that demo night is not a BTS outage.
38. As a reviewer, I want LLM-free rank HTTP, so that I can curl a ranking and see the same numbers the scoring module returns.
39. As a reviewer, I want CI with no paid API key, so that GitHub Actions proves scoring without Anthropic.
40. As a reviewer, I want README keys to be `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, never `CLAUDE_CODE_OAUTH_TOKEN`, so that I do not paste the wrong secret.
41. As a reviewer, I want DESIGN.md covering thesis, weights, join key, LLM boundary, snapshot vintage, and known gaps, so that the architecture writeup is not a second product.
42. As a build, I want ingest to write a Zod-validated snapshot keyed by IATA, so that scoring never joins on BTS CityMarketID.
43. As a build, I want scoring free of LLM and network imports, so that a purity test can fail the PR if someone imports the SDK into the screen.

## Implementation Decisions

### Stack

- TypeScript only. Next.js App Router. Vercel for the live URL.
- Convex: **Auth + threads only**. Email + password, open signup. Social providers are stretch.
- Committed JSON snapshot of every FAA primary commercial airport by ACAIS enplanements — hub size large, medium, small or **nonhub**. Optional rebuild script. Fresh clone runs offline from the committed file.
- Scoring is a pure module: no LLM, no fetch, no Convex.
- Agent: Vercel AI SDK `streamText` in a route handler. Cap tool steps (eight is enough). Auth order: `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY` (`OPENAI_MODEL` default `gpt-4o`, fallback `gpt-4o-mini`).
- LLM vendor SDK imported in exactly one module so scoring purity stays grep-verifiable.
- Do not split into Python + TypeScript. Do not use LangGraph. Do not put airports or scores in Convex. Do not add a weight slider.

### Surfaces and gate

- `/` — **Landing** when signed out. When signed in, redirect to chat (last thread, else empty).
- `/login` — password sign-up and sign-in, dark zip chrome, no second visual system. Wears the shared site header. Identity on the left reaches the **Landing** (`/`) without signing in, whether login was opened from a suggested-question card, Chat, or the profile control. Signing in stays optional.
- Shared site header on Landing, login, chat and `/map`: sticky at the top of the viewport, full-bleed (the bar spans the width; its content is padded off the edges, not squeezed into the page column), still — no enter/exit motion. Left is identity: a compact mark plus the wordmark **Airport Investment Intelligence Agent**, not truncated at desktop width, and a destination to `/`. Right is chat, **Map**, GitHub, and the profile control, with the current surface's own control marked — one icon that reaches `/login` signed out and, signed in, opens a Sign out confirmation (Cancel keeps the session on this screen; confirming ends it). Chat adds the comparison window and the recents drawer control; the drawer control leads the bar, so keyboard order is identity, then header actions, then page content. On a phone-width viewport nothing overflows: action labels are read but not drawn, the comparison window shortens to its years, and the wordmark is what gives way. No Methodology control in the left cluster.
- Chat — that header, a left thread rail, and the transcript/composer column beside it. The transcript scrolls under the bar and the composer stays at the bottom of the viewport. No Methodology popover, no Rankings / dossier routes.
- `/map` — the public capacity-pressure skyline. No gate: it opens signed out, with no LLM key and no aviation HTTP. Same bar, with **Map** marked current and the comparison window beside it. Column height is the **composite score**, linear; radius is constant; hue is the **candidate lamp**, always over a legend that names all five lamp words. A withheld composite is a flat neutral ring, never a short red column. Hover, keyboard focus, and a tap-pin show one tooltip — IATA, lamp pill, composite, **score vector** — copied from `scoreUniverse`; a second tap or empty ground dismisses the pin. Close zoom fades in a capped set of IATA labels (nearest in the frustum, on the order of twenty). The ground plane is committed US-states geometry — no Mapbox, no tiles, no token. Numbers come from `scoreUniverse` over the same committed snapshot chat answers from; the canvas holds no second screen. No WebGL is a short empty state that points at that module, not a second SVG map. The page is a skyline plus its key plus that inspect tooltip: no sidecar ranking table, no dossier, no filter chips, no year toggle.
- Thread rail on chat: thread title = first user question; New thread at the top; the open thread marked current; empty recents explains that a question starts one. Dense and near-black, no search, folders, Settled, "show more", or footer tray. On a narrow viewport it is a drawer a header control opens. The comparison window stays in the header, beside the shared actions.
- Gate: unauthenticated `/chat` (or equivalent) → `/login`. Start asking and landing cards go through login, then a new thread. Cards may prefill or send the prompt after sign-in.
- Empty chat: blank transcript + chips (same prompts as landing cards). No thesis paragraph.

### Landing content (screenshot composition, zip palette)

Keep: the shared header (wordmark to the Landing, chat, GitHub, profile control into Sign in), hero, demo card, suggested questions, How it works, Start asking, privacy line if threads store questions (email + questions logged in Convex; never sold), GitHub footer credit.
Drop: the zip's 3D map CTA (the header's **Map** action is the way to `/map`), Clerk/FastAPI/LangGraph/Neon/Cloud Run/Langfuse as “Built on”.
Demo card on the landing is fixture UI in zip chrome, not a second scoring path.

### Snapshot

Join key: **IATA**. Never BTS `CityMarketID`, BTS numeric AirportID, or OurAirports `ident`.

Ingest sources (see `research/aviation-data-sources.md`):

- FAA ACAIS enplanements → universe (every primary: hub L, M, S or N) and hub-size **peer group**, N being **nonhub**
- BTS T-100 Segment → passengers, flights, distance for long-haul share and unmet flight demand
- BTS On-Time Performance → delay (arrival delay minutes, weather delay removed)
- OurAirports airports + runways → name, municipality, state (`iso_region` minus `US-`), runway count
- Static Census-division map from state → `region`
- FAA slot list, hand-coded: Level 2 ORD, LAX, EWR, SFO; Level 3 JFK, LGA, DCA. Re-verify at ingest.

**Comparison window:** latest two full calendar years that exist at ingest. Same pair for every airport. Chrome and `describeMethodology` name those years. Gate/terminal capacity has no free source; congestion uses passengers per runway.

Each snapshot airport carries at least:

- identity: IATA, name
- place: municipality, state, region (one of nine US Census divisions)
- peer group: large / medium / small / nonhub (FAA hub size)
- inputs for the score vector (or explicit missing)
- runway count, long-haul share inputs, slot-limit label
- coverage per score-vector component

As-of date is the ingest timestamp plus the comparison-window years, written into the snapshot and the architecture doc.

### Scoring

Percentile within FAA hub-size **peer group**, national, never recomputed inside a region. Region questions filter, then sort by that composite.

Fixed weights (not a UI knob): congestion 35, unmet flight demand 35, delay 20, growth 10.

**Candidate lamp** (from the locked prototype):

- Strong candidate — composite ≥ 70 and all four inputs present
- Mixed vector — 40 ≤ composite < 70 and all four present
- Weak candidate — composite < 40 and all four present
- Partial inputs — at least one component missing; withhold composite (`—`); do not emit a 3-of-4 number; do not zero-fill; do not re-weight remaining components into a fake composite
- No data — no composite available

Hue never without a text pill. Missing is never red. On the ranking table the lamp words carry hue: Strong candidate green, Mixed vector yellow, Weak candidate red, Partial inputs and No data grey or outline. A legend names those five lamp words beside their hue, so the table reads without colour. Percentile bars inside the score vector stay grey, and indigo stays send, focus, and links. In-thread lamp hue is in scope, and so is the `/map` skyline, whose columns take the same three hues off the same tokens and sit over a legend naming all five lamp words. A heat-map page is not.

Module shape (names can move; behavior cannot):

```
scoreUniverse(snapshot) → ScoredAirport[]
queryAirports(scored, { iata?, region?, state?, municipality?, peerGroup?, sortBy, metric, limit }) → QueryResult
candidateLamp(row) → lamp
```

`sortBy`: `composite` (default) or one of `congestion` | `unmetFlightDemand` | `delay` | `growth`. Default limit 10, hard cap 25. A two-code compare ignores the default limit and returns those rows.

`metric`: one of those four, or `longHaulShare` — a **single-metric lookup** (story 30). It asks for one number per airport instead of a ranking and orders the rows by that raw number, so `sortBy` is null on a lookup and `metric` is null on a ranking. The rows are unchanged; the answer objects are what withhold the composite and the candidate lamp, because a lookup is not an investment recommendation.

Row payload (every `queryAirports` row):

```
{
  iata, name, municipality, state, region, latitude, longitude, peerGroup,
  scoreVector: {
    congestion, unmetFlightDemand, delay, growth
    // each: { percentile, raw, coverage: "present" | "missing" }
  },
  composite: number | null,
  candidateLamp: "Strong candidate" | "Mixed vector" | "Weak candidate" | "Partial inputs" | "No data",
  slotLimit: "Level 2" | "Level 3" | null,
  longHaulShare: number | null,  // passenger-weighted origin segments, Distance > 2000 mi
  assumptions: string[],
  gaps: string[]
}
```

Long-haul share is a lookup, not a score-vector slot. `latitude` and `longitude`
are the snapshot's OurAirports degrees, passed through so a thread can place a
resolved airport set without a second lookup; they are null only as a pair, and
the screen never computes on them.

### Agent tools (two — do not expand)

Locked in [What tools does the agent get, and how does it reason](https://github.com/davidFeldqwe/forward-deployed-exam/issues/6) and the prototype ticket. A six-tool split (`resolve_airports`, `rank_airports`, …) is rejected: place resolution is **data**, and mock tools from the zip do not enter this product.

- `queryAirports` — only path to airport numbers. Filters, sort and single-metric lookup as above.
- `describeMethodology` — weights, window, peer-group rule, long-haul cutoff, stated gaps. No ranking.

Geography is a **resolved airport set** block, never a tool. Informal phrases (“Pacific Northwest”) are the model’s job mapped to states; unknown phrases refuse.

When the place phrase is ambiguous, do not let the model pick an airport: refuse or ask, and do not call `queryAirports` on a guess (code-enforced if cheap; prompt-only if not).

Assumptions live on the tool result **and** in prose.

Follow-up: full message list in the **Thread**, including prior tool results. A new place phrase → a new `queryAirports` call.

### HTTP

- `POST /api/chat` SSE for the signed-in agent. `streamText` runs in the one LLM module the route handler calls.
- LLM-free, curlable: rank, one airport by IATA, compare two IATAs. These call the same scoring functions the tools call. Equivalence test: HTTP body equals the module output for a pinned query.

### Chat UI states the build must name

Empty, Ranking, Comparison (raw congestion; percentiles not comparable across peer groups), Single metric, Reasoning, Inspectable tools, Partial inputs / no data, Out of scope, Unresolvable place, Follow-up, Streaming.

Ranking table, score vector, resolved-set line, **carried context** and the streaming pending row render from tool payloads and the message list, not from model text. The two refusals — off-thesis, and a place phrase the screen cannot resolve — are locked copy the repo owns: the prompt hands the model the same string the answer objects draw, so prose and block cannot disagree about what the screen answers. Per-answer caveats block. Canonical fixture: `prototype/transcripts/new-england-ranking.md` (numbers there are fake except locks: long-haul is >2000 mi, passenger-weighted).

**In-thread map.** A ranking answer also draws the resolved airport set as an inline SVG, immediately after the ranking table and before this answer's caveats, and only when all of: this user message names a US state or one of the nine Census divisions (a closed list, not keyword soup), this turn's `queryAirports` filtered on `state` or `region`, and two or more returned rows carry coordinates. A follow-up gets no map even while the carried context is still New England, an IATA compare is two codes rather than a place, and a single-metric lookup gets none either — it withholds the candidate lamp, and a marker is that lamp as a dot. The SVG is cropped to the set's own bounding box with padding: no tiles, no map library, no WebGL, and nothing fetched to draw it. Committed Census state outlines sit under the markers in that same crop so the picture reads as geography, not a blank card of dots. Markers take their hue and their words from the same rows the table drew, with the table's legend under the drawing; where a marker and a row seem to disagree, the row is the answer. The heading and the caption name the place the drawn rows are all in — the word the message used when the rows bear it out, otherwise the division they share, otherwise no place at all: a heading is a claim about the dots under it.

**In-thread composite chart and Copy/CSV.** A ranking answer also draws a horizontal bar chart of **composite score** by IATA, after the map when a map is present (otherwise after the ranking table) and before this answer's caveats. Bars take the same lamp hues as the table; **Partial inputs** and **No data** have no composite bar — a hollow placeholder with no number. Copy and CSV attach to the ranking table and serialize IATA, name, composite, candidate lamp, and why-labels from the `queryAirports` payload, not from styled cell text. They do not include operating profit, HHI, Form 127, net revenue, or an opportunity score. A single-metric lookup has no chart and no Copy/CSV of those ranking columns. No chart library: inline SVG is enough.

### Threads (Convex)

A thread belongs to one user. Title = first user question. Messages persist user text, assistant text, and tool payloads needed to re-render answer objects. No extra `lastResolvedSet` store beyond what the message list already holds.

### Docs and demo

- README: `pnpm dev`, Convex env, which API key to set, that clone is offline for scoring.
- DESIGN.md: hybrid thesis, weights, IATA join, LLM vs code, snapshot vintage, gaps (gate capacity, live APIs not called at query time).
- Optional `MOCK_LLM` replay of canned tool loops for the sample questions so UI work does not burn tokens and a key-free demo of chrome is possible.
- Keep real commit history; do not squash the exam into one commit.

## Testing Decisions

A good test asserts **external behavior**: given this snapshot (or fixture slice), this query returns these composites, lamps, and coverage flags. It does not assert file layout, React internals, or prompt text.

**Primary seam (one):** the scoring module — `queryAirports` / `scoreUniverse` on a fixture snapshot. Every number the product shows must be explainable from this seam. Prefer this seam over new ones.

**Pinned to that seam:**

- Hand-computed formulas on a tiny fixture (known percentiles, weights 35/35/20/10, comparison window).
- Missing ≠ zero; partial inputs withhold composite.
- SNA and LAX not in the same peer group; region filter does not re-percentile.
- IATA identity: ORD and MDW stay distinct; never join on city market.
- Import purity: scoring module does not import LLM, network, or Convex.
- Equivalence: LLM-free rank HTTP returns exactly the scoring-module result for a pinned query.

**Second seam, only for the shell:** HTTP gate and Convex auth (signed-out chat redirects; signed-in thread round-trip). No LLM in these tests.

**Not tests:** LLM-as-judge evals, golden chat transcripts that need a paid key in CI, pixel tests of the zip.

There is no prior test suite in this repo; scoring tests are the first.

## Out of Scope

- Voice input, cloud TTS, PDF export, heat-map-as-a-page, public guest chat (browser `speechSynthesis` on the last assistant prose is reopened by [exam edges](https://github.com/davidFeldqwe/forward-deployed-exam/issues/24); it adds no vendor and no key)
- Live aviation HTTP at query time (document the vintage instead)
- Universe beyond the FAA primary line: nonprimary commercial service (2,500–10,000 enplanements)
- Airports, scores, or ingest output stored in Convex
- Weight sliders, ROI / profit / construction cost / land / politics / airline leases as scored inputs
- Gate/terminal capacity as a real field (proxy only)
- Metro grouping; BTS CityMarketID as identity
- On `/map`: Mapbox / Leaflet / any basemap token, an SVG twin of the canvas, a sidecar ranking table, a dossier route, filter chips, a year-A/B height toggle, or `?region=` coupling from a **Thread**
- Methodology popover as a page, Rankings or dossier routes (recents as a persistent left column is reopened by [T3 density](https://github.com/davidFeldqwe/forward-deployed-exam/issues/32); it is chrome over the same `listThreads` data)
- LangGraph, split Python/TS stack, Postgres/DuckDB for a few hundred rows
- Social login as a blocker (stretch only)
- Building is not done by this document; this document is the handoff

## Further Notes

- Round 5 of grilling was not answered; **redirect signed-in `/` to last thread** and **chips on empty chat** are the recommendations taken here so the PRD is buildable.
- Stack memo (`handoff-airport-exam-stack-recommendation.md`) supplied purity tests, LLM-free rank HTTP, Vercel deploy, and MOCK_LLM. It also proposed six tools and `resolve_airports`; those lose to the two-tool lock and to place-as-data.
- Prototype pixels are throwaway; lamp thresholds and answer objects are not.
- Exam sample questions should appear as landing cards and empty-chat chips, rewritten in glossary terms.
