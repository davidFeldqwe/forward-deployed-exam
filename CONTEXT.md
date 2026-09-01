# Airport Investment Intelligence

A glossary for a capacity-pressure screen of US airports. The screen finds renovation-investment candidates.

## Prototype

Locked answer shape for the PRD (pixels throwaway):

- [prototype/dark-chat-surface/Airport Investment Intelligence.dc.html](prototype/dark-chat-surface/Airport%20Investment%20Intelligence.dc.html) — zip chrome and answer objects
- [prototype/transcripts/new-england-ranking.md](prototype/transcripts/new-england-ranking.md) — canonical ranking transcript
- [prototype/design-prompt.md](prototype/design-prompt.md) — earlier prompt; chrome/tool-row bits superseded by the lock on [Prototype the answer shape and chat UI](https://github.com/davidFeldqwe/forward-deployed-exam/issues/10)

## Language

### Product

**Landing**:
The public home page. Signed-out people see it. It is not the chat and not a ranking.
_Avoid_: marketing site, dashboard, home as a synonym for the agent

**Thread**:
One persisted conversation for a signed-in user. Its title is the first user question once one is sent; until then it uses standing New thread copy.
_Avoid_: session, chat history (as the object)

**Map**:
The public `/map` surface: one capacity-pressure skyline of the screened universe, extruded from `scoreUniverse`. A surface of its own, not a **Landing** section and not a **Thread** answer object. Column height is the **composite score**; hue is the **candidate lamp**; a withheld composite is a flat ring. Inspect is one tooltip (IATA, lamp, composite, **score vector**), not a sidecar table.
_Avoid_: heat map, globe, basemap, dashboard

**Atlas inset**:
A corner viewport of the **Map**'s own renderer, holding Alaska or Hawaii while the main view holds the contiguous states. The same scene and the same scored columns, seen from a second camera; clicking one brings the main view to that region. There are two, and no more: other territories stay at true coordinates in the main view.
_Avoid_: mini-map, second map, thumbnail

### Thesis

**Renovation-investment candidate**:
An airport where a terminal renovation can pay off by adding flight capacity and passenger capacity.
_Avoid_: strong airport, best airport, busy airport

**Hybrid thesis**:
Constraint-relief is the main investment reason. Growth without a capacity wall is a weaker reason. Both belong in the score vector.

**Constraint-relief**:
The airport is at a capacity wall. More terminal capacity would serve demand that the airport cannot serve today.

**Capacity-pressure screen**:
A ranking of airports by capacity pressure.
_Avoid_: profit, ROI, construction cost, land, politics, airline lease, gate capacity

### Measurements

**Congestion**:
Passengers per runway in a year.
_Avoid_: delay, utilization

**Delay**:
Arrival delay minutes with weather delay removed.
_Avoid_: congestion

**Growth**:
The rise in passengers from the first year of the comparison window to the second year.
_Avoid_: unmet flight demand

**Unmet flight demand**:
The amount by which passenger growth exceeds flight growth, over the comparison window.
_Avoid_: leakage, load factor

**Comparison window**:
The latest full calendar year and the year before it. Every airport uses the same two years.

**Slot limit**:
An FAA Level 2 or Level 3 schedule constraint. A why-label, not a score-vector number. SFO is Level 2.

**Long-haul share**:
The share of passengers on origin segments with distance above 2,000 miles, in the comparison window. A lookup, not a score-vector number.
_Avoid_: score vector, route count

**Coverage**:
Whether a score-vector component has its inputs in the snapshot. Missing is not a low score.
_Avoid_: zero-fill, impute

**Partial inputs**:
A coverage state: at least one score-vector component is missing, so there is no composite. It is not a weak score.
_Avoid_: no data, weak candidate, zero-fill

### Output

**Score vector**:
Four numbers for one airport: congestion, delay, unmet flight demand, and growth.
_Avoid_: long-haul share

**Peer group**:
Airports of one FAA hub size: large, medium, small, or nonhub. Santa Ana and Los Angeles are not in the same peer group, and a nonhub airport's percentiles are ranks among nonhub airports.
_Avoid_: universe, city, metro

**Composite score**:
One number made from the score vector. Each component is a percentile in the peer group. Constraint-relief weighs more than growth. Weights are fixed.
_Avoid_: rank, grade, profit

**Region**:
One of the nine US Census divisions, derived from the airport's state. New England is a region.
_Avoid_: metro, area, market, city market

**Resolved airport set**:
The airports that a place phrase maps to. The agent names this set before it ranks the airports.
_Avoid_: metro area, grouping

**Candidate lamp**:
A renovation-investment-candidate signal on an airport that has a composite: Strong candidate, Mixed vector, or Weak candidate. Ranking table rows carry hue together with the lamp words — Strong candidate green, Mixed vector yellow, Weak candidate red — and a legend names the five lamp words beside their hue. Hue never appears without a text pill. Missing data is Partial inputs or No data: grey or outline, never red. Percentile bars in the score vector stay grey, and indigo stays send, focus, and links.
_Avoid_: candidate signal, traffic light, grade, RAG

**Carried context**:
How this thread resolved a follow-up reference (for example “the second one”). It is shown before the follow-up answer.
_Avoid_: guess, inferred airport

**Thread answer**:
One assistant turn, as an ordered list of blocks: tool rows, carried context, every resolved airport set, the model’s prose, every ranking or lookup table, then one caveats block for the whole turn. Empty blocks are omitted, so a methodology answer is a tool row and prose. A question in flight is a pending row with no composite score, candidate lamp or score vector in it.
_Avoid_: message, bubble, answer card
