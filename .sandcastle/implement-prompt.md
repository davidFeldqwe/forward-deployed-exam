# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view <ID>`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

Before committing, run `pnpm typecheck` and `pnpm test` (or `pnpm --filter <package> typecheck`/`test` if scoping to one package) to ensure the tests pass.

Run every command in the foreground and wait for it. Never background a command (no `&`, no background-task tooling): nothing will wake you when it finishes, and the run stalls until it is killed.

Scope test and typecheck runs to the packages you touched. A whole-workspace run is slower in this sandbox and can hit idle-timeout territory; run one at the end if you need it, not as a routine check.

This repo uses pnpm exclusively — there is no npm lockfile. Never run `npm install` or `npm run` anything; doing so corrupts node_modules and breaks the workspace for every other agent.

Dependencies are already installed by the sandbox startup hook. Never delete `node_modules` and never run `pnpm install --no-frozen-lockfile` — reinstalling from scratch takes longer than the iteration budget and has produced zero-commit runs. If a dependency looks missing, say so in the issue comment instead.

# COMMIT

Commit as soon as a change typechecks and its own tests pass — before any whole-package or pipeline run. Uncommitted work is invisible to this system: the reviewer and the merge step only run when the branch has commits, so a run that ends with everything still in the working tree counts as having done nothing. Amend or add follow-up commits if later verification finds a problem.

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
