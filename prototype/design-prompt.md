# Design prompt — Airport Investment Intelligence Agent (static UI prototype)

> Paste everything below the line into Claude. Self-contained: no repo access needed.

---

Design the full UI for a chat-based analyst tool called **Airport Investment Intelligence**. Build it as a **static, clickable React prototype** — no backend, no LLM, no data fetching. Every number and every answer is hardcoded fixture text that I supply or you invent. The output of this exercise is the **shape of an answer**, not working software.

## Who it is for

Analysts at a firm that invests in US airport modernization. They ask questions in plain English and need to decide which airports are worth funding a terminal renovation. They are numerate, skeptical, and will not trust a paragraph of prose that does not show its work. This is an internal analyst tool, not a consumer product: dense, legible, quiet. Think Bloomberg terminal restraint rather than marketing site.

## What the product does

A deterministic scoring engine ranks the ~100 largest US airports as **renovation-investment candidates** — airports where added terminal capacity can pay off because demand exists that the airport cannot serve today. An LLM does language only: it parses the question, calls tools, and explains the numbers. **It never invents a number or a ranking.** The UI has to make that boundary visible — a reviewer should be able to tell, by looking, which parts came from code and which parts came from the model.

## Vocabulary — use these exact words in the UI

- **Renovation-investment candidate** — an airport where terminal renovation can pay off by adding flight and passenger capacity. Never "best airport", "strong airport", "busy airport".
- **Score vector** — four numbers for one airport: **congestion**, **unmet flight demand**, **delay**, **growth**.
  - **Congestion** — passengers per runway per year.
  - **Unmet flight demand** — the amount by which passenger growth exceeded flight growth over the comparison window.
  - **Delay** — average arrival delay minutes, weather delay removed.
  - **Growth** — rise in passengers from the first year of the comparison window to the second.
- **Composite score** — one 0–100 number from the score vector. Each component is a **percentile within the airport's peer group**. Fixed weights: congestion **35**, unmet flight demand **35**, delay **20**, growth **10**. There is no weight slider — weights are a stated methodology, not a knob.
- **Peer group** — airports of one FAA hub size: large, medium, or small. Los Angeles and Santa Ana are **not** peers.
- **Region** — one of the nine **US Census divisions**, derived from the airport's state. "New England" is standard-defined, not hand-drawn.
- **Resolved airport set** — the airports a place phrase maps to. **Every geographic answer names this set before it ranks anything.**
- **Comparison window** — the latest full calendar year and the year before. Same two years for every airport.
- **Slot limit** — an FAA Level 2 / Level 3 schedule constraint. A why-label on an airport, not a scored number.

Explicitly out of the model: construction cost, ROI, land, politics, airline leases. The UI should say so where a user would otherwise assume it.

## Screens and states to design

One main screen — a chat — plus the states below. Show them all as separate panels or a state switcher in the prototype so I can see each without typing.

**1. Empty state.** What the analyst sees first. Must teach the tool's scope in seconds: what it ranks, over what universe, as of what date, and what it does not know. Offer the four sample questions as starters.

**2. A ranking answer.** Question: *"Which airports in New England are strong candidates for terminal expansion?"*
Must contain, in this order:
- the **resolved airport set** — New England → the states → the airports found, with a count, before any ranking
- a ranked list with **composite score** per airport
- a per-airport **component breakdown** — the four percentiles, so a reader can see *why* the composite is what it is. Design this: it is the most important object in the product. A number alone is not a reason.
- **why-labels** where they apply (e.g. slot-limited)
- **assumptions and data gaps** attached to the answer, not buried in a footer

**3. A comparison answer.** Question: *"Compare LA and Santa Ana airport congestion levels."*
The trap: they are in different peer groups, so their percentiles are not comparable and the UI must say that plainly rather than printing two numbers side by side as if they were. Show the raw congestion values too.

**4. A single-metric answer.** Question: *"What is the percentage of long haul flights out of Anchorage airport?"*
Long-haul share is a lookup, **not** a scored component. The answer should be short and not dressed up as an investment recommendation.

**5. A reasoning answer.** Question: *"What is the unmet flight demand in SFO airport and why?"*
Passenger growth vs flight growth over the window, plus the causal story the numbers support and the honest limit of what they prove.

**6. Inspectable tool calls.** The answer is generated by tool calls against the scoring engine. Design how a skeptical analyst opens up a tool invocation and sees the call and what came back — collapsed by default, expandable, never a wall of raw JSON in the reading flow. This is the seam that proves the numbers were computed, not narrated.

**7. A "no data" answer.** An airport where a component is missing. **"No data" must never look like "score is low"** — a missing delay figure and a zero delay figure must be visually unmistakable from each other, and the composite must show that it was computed on partial inputs.

**8. An out-of-scope answer.** Question: *"What will a new terminal at DFW cost?"* Cost, ROI, land, and politics are outside the model. The refusal states what the tool does accept, without apologising twice.

**9. An unresolvable place.** A place phrase that maps to nothing. The tool says what it accepts: states, the nine Census divisions, city names, airport codes.

**10. Follow-up.** Show a two-turn exchange where the second question depends on the first ("*and what about the second one?*"), so I can see how carried context is made visible rather than guessed at.

**11. Streaming / in-flight.** What the answer looks like mid-generation, including a tool call that is still running.

## Design constraints

- Dense and typographic. Data is the ornament. No hero sections, no gradient cards, no emoji, no illustration.
- Numbers in tabular figures, aligned. Percentiles and raw values must be visually distinct — a reader should never mistake one for the other.
- Every score has a unit or a scale label. A bare `72` is a bug.
- Restrained use of colour: reserve it for score intensity and for data-quality signals. Do not colour-code airports.
- Accessible by default: legible contrast, no meaning carried by hue alone, keyboard-reachable disclosure controls.
- Light and dark both readable if that is cheap; light only is acceptable.
- Desktop-first. Analysts are on a laptop.

## What to hand back

- A single React prototype with all states above reachable.
- Fake but *plausible* numbers, internally consistent across states — if SFO's congestion percentile is 88 in one panel it is 88 everywhere.
- Where you made a judgement call I did not specify, say so in one line after the prototype. Do not ask me questions first — make the call, show it, and flag it.

Rough is correct. I am reacting to shape, hierarchy, and honesty about uncertainty — not to polish.
