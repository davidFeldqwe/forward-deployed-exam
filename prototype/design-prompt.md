# Design prompt — Airport Investment Intelligence (full UI mockup)

> Paste everything below the line into Claude. Self-contained: no repo access needed.
>
> Output: a **static, clickable full-app UI mockup** (React). Not a marketing page. Not working software.

---

Design the **full product UI** for a chat-based analyst tool called **Airport Investment Intelligence**. Build it as a **static, clickable React prototype** — no backend, no LLM, no data fetching. Every number and every answer is hardcoded fixture text that you invent and keep internally consistent. The point of this exercise is the **shape of an answer inside a real app shell**.

Do not ask questions first. Make the call, show it, and flag judgement calls in one line after the prototype.

## Who it is for

Analysts at a firm that invests in US airport modernization. They ask questions in plain English and need to decide which airports are worth funding a terminal renovation. They are numerate, skeptical, and will not trust a paragraph of prose that does not show its work. This is an internal analyst tool, not a consumer product: dense, legible, quiet. Data is the ornament.

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
- **Comparison window** — the latest full calendar year and the year before. Same two years for every airport. Use **2023–2024** in the chrome and in answers.
- **Slot limit** — an FAA Level 2 / Level 3 schedule constraint. A why-label on an airport, not a scored number.
- **Long-haul share** — a lookup, not a score-vector component. Never dress it up as an investment recommendation.
- **Coverage** — whether a score-vector component has its inputs. Missing is not a low score. Do not zero-fill.

Explicitly out of the model: construction cost, ROI, land, politics, airline leases. The UI should say so where a user would otherwise assume it.

---

## App shape — chat is the product, with thin product chrome

This is a **full app mockup**, not a naked transcript. Chat is still the only product surface. Do not add Rankings, Airport dossier, or Methodology as separate routes. Do not add a persistent right inspector column.

```
┌──────────────────────────────────────────────────────────┐
│  64px header: wordmark · Methodology popover · 2023–2024 │
├────────────┬─────────────────────────────────────────────┤
│ Thread     │  transcript (scroll)                        │
│ rail       │                                             │
│ ~200px     ├─────────────────────────────────────────────┤
│            │  composer                                   │
└────────────┴─────────────────────────────────────────────┘
```

- **Header** — sticky, 64px, `background: rgba(8,9,10,0.85)`, `backdrop-filter: blur(12px) saturate(180%)`, `border-bottom: 1px solid rgba(255,255,255,0.08)`. Left: compact wordmark **AII** plus product name. Right: comparison window as tertiary text. One **Methodology** ghost button (not a page): popover listing universe (~100 largest US airports), peer groups, fixed weights 35/35/20/10, and out-of-scope items.
- **Thread rail** — 200px, `#0f1011`, `border-right: 1px solid rgba(255,255,255,0.05)`. Inactive labels `#8a8f98` / 14px / weight 510. Active: background `rgba(255,255,255,0.07)`, text `#f7f8f8`. This rail **is the prototype state switcher**: eleven canned threads so every answer state is reachable without typing. No decorative icons.
- **Main canvas** — `#08090a`. Messages scroll. Composer docked at the bottom: input fill `rgba(255,255,255,0.02)`, border `rgba(255,255,255,0.05)`, 6px radius, 12px 14px padding. **Send is the only indigo fill on the screen** (`#5e6ad2`, hover `#828fff`, text `#f7f8f8`, 14px / 510, 6px radius, 8px 16px padding). Composer may be inert except for looking real; switching threads is how you move.
- Desktop-first. Below 768px, collapse the rail behind a menu. Do not design a marketing hero, split landing, or feature-card grid.

---

## Visual system — Linear the *product*, not linear.app marketing

Dark-first engineering tool. Precise, fast, without ornament. **No** indigo ambient glow, **no** display-xl headlines, **no** gradient text, **no** feature cards, **no** bounce.

**Type:** Inter Variable on every UI string. Non-negotiable OpenType on all Inter text: `font-feature-settings: "cv01", "ss03"`. UI labels, nav, buttons, captions: `font-variation-settings: 'wght' 510` — never 500 or 600. Body 16px / 400 / `#d0d6e0`. Headings in-product at most 20–24px / 510 / `#f7f8f8`, tracking about `-0.24px` at 20px. Code and tool payloads: IBM Plex Mono (stand-in for Berkeley Mono) at 12–14px / 510.

**Color:**

| Role | Value |
|------|--------|
| Canvas | `#08090a` |
| Rail / header panel | `#0f1011` |
| Popover / expanded tool / modal | `#191a1b` |
| Raised row / card lift | `rgba(255,255,255,0.05)`, hover `0.07` — luminance stacking, **no** dark drop-shadows on rows |
| Primary text | `#f7f8f8` |
| Body | `#d0d6e0` |
| Meta, inactive nav, informational secondary | `#8a8f98` (minimum for real copy) |
| Placeholder / disabled only | `#62666d` |
| Interactive only (links, send, focus, active affordances) | `#5e6ad2` / hover `#828fff` |
| Borders | `rgba(255,255,255,0.02)` micro, `0.05` subtle, `0.08` standard — never solid hex borders |
| Overlay | `rgba(0,0,0,0.5)` |

Indigo is **not** a score colour. Do not colour airport names.

**Radius:** buttons and inputs 6px; cards / dropdowns 8px; popovers / panels 12px; status pills and lamp pills `9999px`. Buttons are never pills.

**Focus:** `box-shadow: 0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)`.

**Motion:** 150ms `cubic-bezier(0.25, 0.46, 0.45, 0.94)` for hover; 200ms state; 300ms max for popover enter (`opacity 0→1`, `scale(0.96→1)`, `cubic-bezier(0.165, 0.84, 0.44, 1)`). No spring/bounce. Honor `prefers-reduced-motion`.

**Elevation:** brighter surface = higher. Popovers may use Linear popover shadow: `rgba(0,0,0,0.15) 0 4px 12px, rgba(0,0,0,0.2) 0 8px 24px, inset 0 0 0 1px rgba(255,255,255,0.08)`.

Load Inter Variable (e.g. rsms.me/inter) so weight 510 and the glyph features actually render.

---

## Candidate lamp (red / amber / green)

A **renovation-investment-candidate signal** on an airport that has a composite. It is **not** a data-quality lamp and **not** a provenance lamp.

Visual: a vertical traffic light — three 8px dots, **one** lit for Strong / Mixed / Weak; none lit for Partial / No data. Immediately beside it, a **labelled pill**. Hue never travels alone. `aria-label` speaks the label. Do not recode the airport code or the composite numeral in green/red.

| Lamp | Pill label | When | Dot / pill |
|------|------------|------|------------|
| Green | Strong candidate | composite ≥ 70 **and** all four components present | lit `#27a644`; pill `rgba(39,166,68,0.15)` / `#27a644` |
| Amber | Mixed vector | 40 ≤ composite < 70 **and** all four present | lit `#f59e0b`; pill `rgba(245,158,11,0.15)` / `#f59e0b` |
| Red | Weak candidate | composite < 40 **and** all four present | lit `#e53935`; pill `rgba(229,57,53,0.1)` / `#e53935` |
| Hollow | Partial inputs | composite exists but a component is missing | no fill, 1.5px `#8a8f98` ring; pill tertiary text |
| Empty | No data | no composite | no fill, dashed ring; pill tertiary text |

**Never** use the red lamp for missing delay. A computed zero delay can produce a filled lamp from the composite. A missing delay is Hollow or Empty. Missing ≠ zero ≠ weak.

Pills: 12px / 510, min-height 24px, padding 4px 10px, radius 9999px.

---

## Answer objects (design these; they are the product)

**1. Score vector breakdown** — the most important object. Four rows: component name, **percentile** (tabular figures, 510 weight, scale caption `pctl · {large|medium|small} hub`), **raw value** with unit (tertiary), weight (35 / 35 / 20 / 10). Percentile and raw must be visually distinct. Optional grey luminance bar for percentile length only — not indigo, not green-means-good. Every number has a unit or scale. A bare `72` is a bug.

**2. Resolved airport set** — first block in any geographic ranking: place phrase → Census division / states → airport codes → count. Ranking comes after.

**3. Ranked airport row** — code + name, composite with scale `0–100 · composite`, candidate lamp, why-labels (slot-limited = **neutral** pill, not a lamp), expandable or always-visible vector breakdown.

**4. Tool calls** — collapsed by default: tool name + status. Expand in-place (not a third column): arguments and result as definition lists in mono. Never a wall of raw JSON in the reading flow. This is the seam that proves numbers were computed, not narrated.

**5. Assumptions and data gaps** — attached to that answer, not a global footer.

**6. Prose** — `#d0d6e0`, 16/400, left-aligned. Never the only carrier of a number that also lives in a vector.

---

## Eleven threads (show every state)

The left rail lists these. Invent plausible, **internally consistent** fixtures (if SFO congestion percentile is 88 in one thread, it is 88 in every thread that shows SFO).

1. **Empty.** First-run canvas: what it ranks, over what universe, as of 2023–2024, what it does not know. Four starter questions (the ranking, comparison, Anchorage, SFO prompts below). Starters switch threads.

2. **Ranking.** *"Which airports in New England are strong candidates for terminal expansion?"* Resolved set (New England → CT, ME, MA, NH, RI, VT → the airports found, with a count) **before** any ranking. Ranked list with composite, lamp, vector breakdown, why-labels, assumptions.

3. **Comparison.** *"Compare LA and Santa Ana airport congestion levels."* Different peer groups — say that **before** any side-by-side percentile. Show raw congestion. Do not present two percentiles as comparable.

4. **Single metric.** *"What is the percentage of long haul flights out of Anchorage airport?"* Short lookup. No lamp. Not an investment recommendation.

5. **Reasoning.** *"What is the unmet flight demand in SFO airport and why?"* Passenger growth vs flight growth over the window, the story the numbers support, the limit of what they prove. Lamp comes from the **composite**, not from this one component. SFO is slot-limited Level 2.

6. **Inspectable tools.** Same SFO (or the ranking) with one tool invocation **expanded** so the seam is visible.

7. **No data.** An airport with a missing component. Hollow or Empty lamp. Composite marked partial (say which inputs were used; do not treat the missing component as zero). Missing must be unmistakable from a low score.

8. **Out of scope.** *"What will a new terminal at DFW cost?"* Refusal plus what the tool does accept. No apology loop.

9. **Unresolvable place.** A phrase that maps to nothing. State what it accepts: states, the nine Census divisions, city names, airport codes.

10. **Follow-up.** Two-turn: the New England ranking, then *"and what about the second one?"* Make carried context visible — "second" = the second airport in that ranking (use PVD). Do not look like a guess.

11. **Streaming.** Mid-generation: a tool row still running. No scores yet.

---

## Constraints

- Dense and typographic. No emoji, no illustration, no hero, no gradient cards.
- Numbers in tabular figures, aligned.
- Colour: candidate lamp, status/why pills, indigo interaction only.
- Accessible: WCAG AA for copy; lamp + text, not hue alone; keyboard-reachable disclosure; 44px touch targets on icon-only controls.
- Dark only for this mockup.

## What to hand back

- One React prototype with all eleven threads reachable from the rail.
- Fake but plausible numbers, consistent across threads.
- Where you made a judgement call this prompt did not specify, one line after the prototype.

Rough is correct on interaction completeness. Hierarchy, honesty about uncertainty, the lamp vs missing-data distinction, and Linear *app* restraint are not optional.
