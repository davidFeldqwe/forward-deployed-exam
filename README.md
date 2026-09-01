# Airport Investment Intelligence

A capacity-pressure screen of every US primary commercial airport: a signed-in chat
agent that ranks renovation-investment candidates from a committed snapshot,
where every number comes from code and the model never invents one.

- `DESIGN.md` — thesis, weights, join key, the LLM boundary, snapshot vintage, known gaps
- `CONTEXT.md` — the glossary this product speaks
- `PRD.md` — the build handoff and its locks

## Run it

Node 24 (`.nvmrc`) and pnpm 10 (pinned by `packageManager`; `.npmrc` refuses a
different version). pnpm only — there is no npm lockfile.

```sh
pnpm install
pnpm dev
```

`http://localhost:3000` serves the signed-out Landing. Chat is gated: the
suggested-question cards go through `/login`, which is email + password with
open signup, and then into a new Thread.

`/map` is not gated. It is the capacity-pressure skyline: every scored airport
in the snapshot as a column whose height is its **composite score**, at its own
coordinates, over committed US-states geometry. There is no basemap token and no
tile request, and the numbers are `scoreUniverse` over the same committed
snapshot chat answers from. A browser with no WebGL gets a short empty state
rather than a second map.

No LLM key is needed to start. Without one the app still stores your question
and says so in the transcript; the screen itself — snapshot, scoring, answer
objects — needs no key at all.

A reviewer can curl the screen the same way, with no key and no session. The
JSON body is the `queryAirports` result for that query:

```sh
curl -s http://localhost:3000/api/rank
curl -s 'http://localhost:3000/api/rank?region=New%20England'
curl -s http://localhost:3000/api/airports/LAX
curl -s http://localhost:3000/api/compare/LAX/SNA
```

Signed-in chat is `POST /api/chat` (SSE). It needs a session cookie; without one
the response is a redirect to `/login`. The question is stored before any model
call. Without an API key the app still stores the question and says so in the
transcript.

## Environment

| Variable | Used for |
| --- | --- |
| `ANTHROPIC_API_KEY` | the agent's model. Tried first when both keys are set. |
| `OPENAI_API_KEY` | the agent's model when the Anthropic key is absent. |
| `ANTHROPIC_MODEL` | override the default Anthropic model. |
| `OPENAI_MODEL` | override the default OpenAI model (`gpt-4o`, falling back to `gpt-4o-mini` if the account cannot see it). |
| `AUTOCOMPLETE_MODEL` | optional cheaper model for the composer ghost; same API key family as chat. |
| `MOCK_LLM` | set to `1` for a canned New England composer ghost. CI leaves this unset and has no paid key. |
| `AUTH_SECRET` | signs the session cookie. Required when `NODE_ENV` is `production`; development falls back to a dev-only secret. |
| `CONVEX_URL` | the Convex deployment that holds Auth and Threads. Unset, those two tables live in `.convex/` so a process restart still keeps them. Scoring never reads it. |
| `CONVEX_DEPLOY_KEY` | deploys that Convex project. Airports and scores stay files either way. |

The root `.env.example` is that table with empty values. Copy it to
`apps/web/.env.local` — that is where Next loads it from, and `.gitignore`
refuses every `.env` file but the example — then fill in what you need.

Those two key names are the only LLM credentials this repo reads
(`apps/web/app/agent-provider.ts`). A Claude Code subscription credential is not
an API key and nothing here looks for one — paste a vendor API key or leave both
unset.

Convex stores **Auth and Threads only** (`apps/web/app/convex-store.ts`). A live
`CONVEX_URL` names the hosted project; without one, the same two documents are
the on-disk file so accounts and Threads survive `pnpm dev` restart. Snapshot,
scoring, and every number stay in `packages/`.

## A clone is offline

Scoring reads `packages/snapshot/data/us-airports-snapshot.json` — every US
primary commercial airport in FAA ACAIS, large hub through nonhub, Zod-validated
at load, keyed by IATA. No FAA
or BTS request is made when you clone the repo, when you run the tests, when
`/map` draws, or when the agent answers a question, so demo night does not depend
on a BTS outage. The snapshot's `asOf` and comparison window are its vintage; see
`DESIGN.md`.

Rebuilding it is a deliberate manual step, not part of any run:

```sh
pnpm --filter @repo/snapshot ingest
```

That downloads roughly 700 MB of BTS monthly files into `.cache/` (override with
`INGEST_CACHE_DIR`) and rewrites the committed file.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
```

Scoped runs are faster while working in one package:

```sh
pnpm --filter @repo/scoring test
pnpm --filter @repo/snapshot test
pnpm --filter @repo/web test
```

`.github/workflows/ci.yml` runs those three commands on every push and pull
request with no LLM credential in the environment — no secret is passed to the
job, and a step fails the run if a key is present anyway. So CI proves the
screen's numbers, the snapshot, and the LLM boundary without spending a token.
Two tests exist to fail loudly if that boundary moves:
`packages/scoring/tests/purity.test.ts` (scoring imports no LLM, network, or
Convex) and `apps/web/app/agent-boundary.test.ts` (exactly one module imports a
vendor SDK).

## Layout

| Path | What lives there |
| --- | --- |
| `packages/snapshot` | the committed snapshot, its Zod schema, and the optional ingest |
| `packages/scoring` | the screen: percentiles, weights, composite, candidate lamp, `queryAirports` |
| `apps/web` | Next.js App Router — Landing, login, chat, the two agent tools, the one LLM module |
| `prototype`, `research` | the locked answer shape and the data-source notes; not runtime code |

Each package under `packages/` has its own README with the details of that seam.

## History

The commit history is the record of how this was built, one step at a time, and
is deliberately not squashed. `git log` is part of the exam.
