# Airport Investment Intelligence

A capacity-pressure screen of the ~100 largest US airports: a signed-in chat
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

No LLM key is needed to start. Without one the app still stores your question
and says so in the transcript; the screen itself — snapshot, scoring, answer
objects — needs no key at all.

## Environment

| Variable | Used for |
| --- | --- |
| `ANTHROPIC_API_KEY` | the agent's model. Tried first when both keys are set. |
| `OPENAI_API_KEY` | the agent's model when the Anthropic key is absent. |
| `ANTHROPIC_MODEL` | override the default Anthropic model. |
| `OPENAI_MODEL` | override the default OpenAI model (`gpt-4o`, falling back to `gpt-4o-mini` if the account cannot see it). |
| `AUTH_SECRET` | signs the session cookie. Required when `NODE_ENV` is `production`; development falls back to a dev-only secret. |

Those two key names are the only LLM credentials this repo reads
(`apps/web/app/agent-provider.ts`). A Claude Code subscription credential is not
an API key and nothing here looks for one — paste a vendor API key or leave both
unset.

Convex is scoped to Auth and Threads and is not provisioned yet: Threads live in
the server process, so they survive a refresh but not a restart, and there is no
Convex deployment to configure. The variables above are the whole list; when the
deployment lands its own URL and deploy key join this table.

## A clone is offline

Scoring reads `packages/snapshot/data/us-airports-snapshot.json` — the top 100 US
airports by FAA ACAIS enplanements, Zod-validated at load, keyed by IATA. No FAA
or BTS request is made when you clone the repo, when you run the tests, or when
the agent answers a question, so demo night does not depend on a BTS outage. The
snapshot's `asOf` and comparison window are its vintage; see `DESIGN.md`.

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
