# Airport Investment Intelligence

A glossary for a capacity-pressure screen of US airports. The screen finds renovation-investment candidates.

## Language

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

### Output

**Score vector**:
Four numbers for one airport: congestion, delay, unmet flight demand, and growth.
_Avoid_: long-haul share

**Peer group**:
Airports of one FAA hub size: large, medium, or small. Santa Ana and Los Angeles are not in the same peer group.
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
