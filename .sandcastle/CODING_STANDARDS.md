# Coding Standards

These standards summarize the conventions already present in this repo. Review code against them in addition to the automated pipeline. Vocabulary is `CONTEXT.md`. Do not relitigate locks in `PRD.md`.

## Style

- Use TypeScript strictly. Do not introduce `any`; use `unknown`, domain types, generics, or schema-derived types instead.
- Use camelCase for variables, functions, parameters, and object properties; PascalCase for React components and type-like declarations; UPPER_CASE only for true constants.
- Keep imports ordered with a blank line after imports. Use inline `type` imports/exports where appropriate.
- Prefix intentionally unused parameters and locals with `_` (ESLint `argsIgnorePattern` / `varsIgnorePattern`).
- Do not leave `console.*` in application or package code. Server startup and operational messages may use `process.stdout.write` / `process.stderr.write` when intentional.
- Do not rely on implicit coercion, `var`, loose equality, sequences, floating promises, or thrown non-`Error` values.
- Keep functions small enough to read directly. Prefer extracting pure helpers over adding comments to explain tangled code.
- Comments should explain non-obvious intent, boundaries, or external constraints. Avoid comments that restate the code.
- File names follow existing layout: Next.js App Router files stay `page.tsx` / `layout.tsx` under kebab-case route folders; shared `.ts` modules kebab-case; React component files PascalCase when introduced.
- Match surrounding formatting. Do not introduce a formatter or CSS plugin that the repo does not already run.
- UI chrome follows the locked zip palette. Percentile bars stay grey; indigo is reserved for send, focus, and links. Avoid `!important`, magic colors, and nesting deeper than two levels except for allowed pseudo-class cases.
- Analyst-facing copy uses glossary terms from `CONTEXT.md` (renovation-investment candidate, score vector, candidate lamp, resolved airport set, carried context, comparison window). Do not invent synonyms the glossary tells you to avoid.

## Testing

- Add or update tests whenever behavior changes. Prefer focused tests beside the code or in a package `tests/` directory: `*.test.ts` or `*.test.tsx`.
- A good test asserts **external behavior**: given this snapshot (or fixture slice), this query returns these composites, lamps, and coverage flags. It does not assert file layout, React internals, or prompt text.
- The primary seam is the scoring module — `queryAirports` / `scoreUniverse` on a fixture snapshot. Every number the product shows must be explainable from this seam. Prefer this seam over new ones.
- Test pure domain helpers in `@repo/scoring` directly instead of testing them only through mounted components or chat.
- Use descriptive test names that state expected behavior and important edge cases.
- Preserve regression tests for bugs, especially: missing ≠ zero; partial inputs withhold composite; SNA and LAX not in the same peer group; region filter does not re-percentile; IATA identity (ORD and MDW stay distinct); scoring import purity (no LLM, network, or Convex); LLM-free rank HTTP equals the module output for a pinned query.
- Keep tests deterministic. Avoid real network calls and paid LLM keys in CI. The shell seam (HTTP gate, Convex auth) is allowed without an LLM.
- Not tests: LLM-as-judge evals, golden chat transcripts that need a paid key in CI, pixel tests of the zip. A local Evalite loop (`pnpm --filter @repo/web eval`) is allowed beside the web app for a reviewer with a key; it is not the default test job, and a missing key skips.
- Run the relevant validation before handoff. For broad changes, run `pnpm typecheck`, `pnpm lint`, and `pnpm test`; for scoped changes, run the matching `pnpm --filter <package> …` plus any affected package task.

## Architecture

- Respect the monorepo boundaries:
  - `packages/scoring` — airport scoring types, formulas, `scoreUniverse` / `queryAirports` / `candidateLamp`. No LLM, no fetch, no Convex. Scoring formulas live only here.
  - `apps/web` — Next.js App Router: Landing (`/`), login (`/login`), chat, and the public map (`/map`). Depends on `@repo/scoring`; do not re-embed scoring rules in the app. The map is a view of `scoreUniverse`: heights and lamps come from scored rows, never from the canvas.
  - `packages/eslint-config` and `packages/typescript-config` — shared tooling only
  - `prototype/` — throwaway pixels and locked answer-shape fixtures; do not treat HTML as a second scoring path
  - `research/` — source notes; not runtime code
- Keep domain rules aligned with `CONTEXT.md` and `PRD.md`. In particular:
  - Join key is **IATA**. Never BTS `CityMarketID`, BTS numeric AirportID, or OurAirports `ident`
  - Scoring is a committed snapshot of every US primary commercial airport. Fresh clone runs offline from that file. No live aviation HTTP at query time
  - Score vector is four components: congestion, unmet flight demand, delay, growth. Long-haul share and slot limit are lookups / why-labels, not vector slots
  - Percentile within FAA hub-size **peer group**, national. Region questions filter, then sort; they do not re-percentile
  - Fixed weights: congestion 35, unmet flight demand 35, delay 20, growth 10. No weight slider
  - Missing coverage is not a low score. Partial inputs withhold composite (`—`); do not zero-fill or re-weight remaining components
  - Candidate lamp is a text pill (hue never without text). Missing is Partial inputs or No data, never red
  - Convex stores **Auth + Threads only**. Do not put airports, scores, or ingest output in Convex
  - Agent tools are exactly two: `queryAirports` and `describeMethodology`. Place resolution is data (resolved airport set), not a third tool
  - The LLM never invents a number or a ranking. Ranking table, score vector, and resolved-set line render from tool payloads
  - LLM vendor SDK imported in exactly one module so scoring purity stays grep-verifiable
- Validate snapshot and query payloads at boundaries (Zod on ingest/snapshot). Do not replace that with ad-hoc hand-rolled validators at the same boundary.
- Prefer pure functions for filtering, formatting, parsing, percentile math, and lamp decisions. Keep React components focused on rendering and interaction wiring.
- Keep shared logic in `packages/scoring` only when it is genuinely reused across app/package boundaries. Do not create shared abstractions for one caller.
- In `apps/web`, keep route handlers and pages thin: delegate ranking and methodology to `@repo/scoring` rather than re-embedding domain rules.
- Client UI is the locked zip chrome: signed-out Landing, gated chat, one shared sticky full-bleed site header (identity left; chat, Map, GitHub and the profile control right, with the current surface marked; no overflow at phone width), a dense left thread rail for recents beside the transcript column, the public `/map` skyline as the one 3D surface, no Methodology popover as a page. The rail is chrome over `listThreads`: no search, folders, Settled, unread counts, or timestamps. Preserve accessibility attributes, button semantics, and keyboard/screen-reader affordances when editing UI.
- Off-thesis questions (cost, ROI, land, politics, leases) are refused. Unknown place phrases are refused; do not geocode a guess.
- Do not introduce new infrastructure, dependencies, or cross-package patterns unless they solve a real boundary problem and fit the existing architecture. Do not split into Python + TypeScript. Do not use LangGraph.

## Maintainability Review Bar

- Do not approve code merely because it works. The implementation should leave the surrounding code at least as simple, modular, and readable as before.
- Look for structural simplifications before accepting local cleanup. If a change can delete branches, helpers, modes, wrappers, or special cases while preserving behavior, prefer that shape.
- Treat new ad-hoc conditionals in busy flows as a design smell. Move feature-specific logic into the module, helper, policy, or state model that owns the concept.
- Push back on spaghetti growth: scattered flags, nullable modes, one-off booleans, copy-pasted branches, and edge-case logic embedded in unrelated paths.
- Avoid thin wrappers, identity helpers, and generic magic that hide simple data-shape assumptions without improving clarity.
- Keep type boundaries explicit. Airport/score casts, unnecessary optionality, `unknown`, or loosely-shaped objects when a clearer contract or schema-derived type would simplify the flow.
- Keep logic in the canonical layer. Reuse existing helpers and shared contracts instead of introducing near-duplicates in feature code.
- Prefer direct, boring code over clever abstractions. Add an abstraction only when it removes real complexity or matches an established local pattern.
- If a file approaches or crosses 1000 lines, treat that as a decomposition concern by default. Extract focused helpers, subcomponents, or modules unless there is a strong structural reason not to.
- Separate orchestration from business logic. If independent async work is serialized for no reason, or related updates can leave state half-applied, ask whether a simpler parallel or atomic structure exists.
- Prioritize review findings in this order: structural regressions, missed simplifications, branching complexity, boundary/type problems, file-size concerns, modularity issues, then readability nits.

## Quality Gates

- Type checking: `pnpm typecheck` (Turbo `typecheck` across packages).
- Linting: `pnpm lint`.
- Tests: `pnpm test`.
- Build: `pnpm build`.
- Package manager: pnpm exclusively (`packageManager` in the root `package.json`). Never run `npm install` or `npm run`.
