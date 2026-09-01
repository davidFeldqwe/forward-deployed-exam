// Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             A Cursor agent (cursor-grok-4.6-medium) analyzes
//                               open issues, builds a dependency graph, and
//                               outputs a <plan> JSON listing unblocked issues
//                               with branch names.
//   Phase 2 (Execute + Review): Up to MAX_CONCURRENT_ISSUES issues run in
//                               parallel, each in its own sandbox created via
//                               createSandbox(). The Cursor implementer
//                               (cursor-grok-4.6-medium) runs first (100
//                               iterations). If it produces
//                               commits, a Cursor reviewer
//                               (cursor-grok-4.6-medium) runs in the same
//                               sandbox on the same branch (1 iteration).
//   Phase 3 (Merge):            Host `git merge --no-edit` as soon as each
//                               issue finishes, serialized so git is not raced.
//                               A hung sibling must not block a finished branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { podman } from "@ai-hero/sandcastle/sandboxes/podman";
import { execFileSync } from "node:child_process";
import { z } from "zod";

// Rootless keep-id races on concurrent podman run (crun ping_group_range).
// On macOS Podman machine, virtiofs already maps host ownership; userns
// keep-id is unnecessary and breaks concurrent creates.
const sandboxProvider = podman({ userns: false });

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const planSchema = z.object({
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), branch: z.string() }),
  ),
});

type PlannedIssue = z.infer<typeof planSchema>["issues"][number];

/** True when `branch` has commits that are not on HEAD (ready to merge). */
function branchHasCommitsAhead(branch: string): boolean {
  try {
    const count = execFileSync(
      "git",
      ["rev-list", "--count", `HEAD..${branch}`],
      { encoding: "utf8" },
    ).trim();
    return Number(count) > 0;
  } catch {
    return false;
  }
}

/** Branch tip SHA, or undefined when the branch does not exist. */
function branchTip(branch: string): string | undefined {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--verify", "--quiet", `${branch}^{commit}`],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return undefined;
  }
}

/** True when `sha` is reachable from HEAD. */
function isOnHead(sha: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge `branch` into HEAD on the host. Abort on conflict so the next cycle can retry.
 */
function mergeBranchOnHost(branch: string): boolean {
  try {
    execFileSync("git", ["merge", branch, "--no-edit"], { encoding: "utf8" });
    console.log(`  ✓ merged ${branch}`);
    return true;
  } catch (reason: unknown) {
    const stderr =
      reason &&
      typeof reason === "object" &&
      "stderr" in reason &&
      reason.stderr != null
        ? String(reason.stderr)
        : "";
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`  ✗ merge ${branch} failed: ${stderr || message}`);
    try {
      execFileSync("git", ["merge", "--abort"], { stdio: "ignore" });
    } catch {
      // no in-progress merge
    }
    return false;
  }
}

function closeIssuesAfterMerge(issues: PlannedIssue[]): void {
  // Host-side close after merge. Do not rely on an agent for this — a merge
  // that lands without `gh issue close` leaves the issue open so the planner
  // re-selects it on the next cycle.
  for (const issue of issues) {
    try {
      execFileSync(
        "gh",
        ["issue", "close", issue.id, "--comment", "Completed by Sandcastle"],
        { encoding: "utf8" },
      );
      console.log(`  ✓ closed #${issue.id}`);
    } catch (reason: unknown) {
      const stderr =
        reason &&
        typeof reason === "object" &&
        "stderr" in reason &&
        reason.stderr != null
          ? String(reason.stderr)
          : "";
      const message = reason instanceof Error ? reason.message : String(reason);
      const detail = `${stderr}\n${message}`;
      if (/already closed|HTTP 422/i.test(detail)) {
        console.log(`  · #${issue.id} already closed`);
        continue;
      }
      console.error(`  ✗ failed to close #${issue.id}: ${stderr || message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 100;

// Number of unblocked issues to plan and execute concurrently each cycle.
const MAX_CONCURRENT_ISSUES = 3;

// Large issues can spend long stretches reading without emitting output;
// default 600s idle timeout is too tight.
const IMPLEMENTER_IDLE_TIMEOUT_SECONDS = 1800;

const cursor = () => sandcastle.cursor("cursor-grok-4.6-medium");

// Hooks run inside the sandbox before the agent starts each iteration.
// Frozen-lockfile install ensures the sandbox always has fresh dependencies
// without touching the lockfile or triggering husky/CI-only steps.
const hooks = {
  sandbox: {
    onSandboxReady: [
      {
        command:
          "export PATH=\"/usr/local/bin:/usr/bin:$PATH\"; CI=true HUSKY=0 pnpm install --frozen-lockfile --store-dir /tmp/pnpm-store-sandcastle",
        timeoutMs: 600_000,
      },
    ],
  },
};

/** Planner only needs `gh` — skip `pnpm install` for a faster cold start. */
const plannerHooks = { sandbox: { onSandboxReady: [] } };

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
// The root copy alone leaves every workspace package with an empty
// node_modules: those dirs are gitignored (so absent from a fresh worktree)
// and the frozen-lockfile hook does not recreate them from the copied virtual
// store. Agents then hit unresolvable @repo/* and tsc. Sandcastle copies with
// `cp -c -R`, which preserves the symlinks-into-.pnpm rather than
// dereferencing them, so this stays cheap.
const copyToWorktree = [
  "node_modules",
  ...[
    "packages/scoring",
    "packages/eslint-config",
    "packages/typescript-config",
    "apps/web",
  ].map((dir) => `${dir}/node_modules`),
];
const COPY_TO_WORKTREE_MS = 300_000;

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent (cursor-grok-4.6-medium) reads the open issue list,
  // builds a dependency graph, and selects unblocked issues that can be worked.
  // Up to MAX_CONCURRENT_ISSUES planned issues are taken each cycle.
  //
  // It outputs a <plan> JSON block — Output.object parses and validates it.
  // -------------------------------------------------------------------------
  const plan = await sandcastle.run({
    hooks: plannerHooks,
    sandbox: sandboxProvider,
    name: "planner",
    // One iteration is enough: the planner just needs to read and reason,
    // not write code. (Structured output requires maxIterations: 1.)
    maxIterations: 1,
    agent: cursor(),
    promptFile: "./.sandcastle/plan-prompt.md",
    // Extract and validate the <plan> JSON into a typed object. Throws
    // StructuredOutputError if the tag is missing, the JSON is malformed, or
    // validation fails — which aborts the loop.
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });

  // Up to MAX_CONCURRENT_ISSUES issues per cycle, run concurrently (each gets
  // its own sandbox). Re-planning after merge picks up any remaining
  // unblocked issues.
  const issues = plan.output.issues.slice(0, MAX_CONCURRENT_ISSUES);

  if (issues.length === 0) {
    // No unblocked work — either everything is done or everything is blocked.
    console.log("No unblocked issues to work on. Exiting.");
    break;
  }

  console.log(
    `Planning complete. Working on ${issues.length} issue(s) concurrently:`,
  );
  for (const issue of issues) {
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + Review (concurrent — up to MAX_CONCURRENT_ISSUES at
  // once)
  //
  // Create a sandbox via createSandbox() so the implementer and reviewer share
  // the same sandbox instance per branch. The implementer runs first; if it
  // produces commits, the reviewer runs in the same sandbox. Each issue gets
  // its own sandbox. Merge happens as soon as that issue finishes — waiting
  // for Promise.all before merge left a finished branch stranded behind a
  // hung sibling (e.g. #21 done, #19 stuck on pnpm). Host git merge is
  // serialized so two finishers cannot race the index.
  // -------------------------------------------------------------------------

  // A completed issue carries the branch tip observed at the end of phase 2,
  // which is the evidence used to prove the merge landed.
  type CompletedIssue = PlannedIssue & { tip: string | undefined };

  const mergeAndCloseIfReady = (issue: CompletedIssue): void => {
    console.log(`\nMerging ${issue.branch} on host:`);
    mergeBranchOnHost(issue.branch);
    if (issue.tip !== undefined && isOnHead(issue.tip)) {
      console.log(`Closing #${issue.id}:`);
      closeIssuesAfterMerge([issue]);
    } else {
      console.log(
        `  · ${issue.id}: branch not merged into HEAD — leaving open for retry`,
      );
    }
  };

  let hostMerge = Promise.resolve();
  const mergeWhenIdle = (issue: CompletedIssue): Promise<void> => {
    hostMerge = hostMerge.then(
      () => mergeAndCloseIfReady(issue),
      () => mergeAndCloseIfReady(issue),
    );
    return hostMerge;
  };

  const executeIssue = async (
    issue: PlannedIssue,
  ): Promise<CompletedIssue | undefined> => {
    // ponytail: no cross-run recovery. If this process dies between the merge
    // and the close below, the issue stays open and the next cycle burns one
    // implementer run that produces nothing ("branch not ahead — skip merge");
    // close it by hand. Guessing from commit history instead re-closes any
    // reopened issue whose old RALPH commit is still on HEAD.
    try {
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: sandboxProvider,
        hooks,
        copyToWorktree,
        timeouts: { copyToWorktreeMs: COPY_TO_WORKTREE_MS },
      });

      try {
        // Run the implementer
        const implement = await sandbox.run({
          name: "implementer",
          maxIterations: 100,
          idleTimeoutSeconds: IMPLEMENTER_IDLE_TIMEOUT_SECONDS,
          agent: cursor(),
          promptFile: "./.sandcastle/implement-prompt.md",
          promptArgs: {
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
        });

        // Review when this run produced commits. Always merge when the branch
        // is ahead of HEAD — otherwise a "already done, no new commits" run
        // skips merge+close and the planner keeps re-picking an open issue.
        if (implement.commits.length > 0) {
          await sandbox.run({
            name: "reviewer",
            maxIterations: 1,
            agent: cursor(),
            promptFile: "./.sandcastle/review-prompt.md",
            promptArgs: {
              BRANCH: issue.branch,
            },
          });
        }

        if (
          implement.commits.length > 0 ||
          branchHasCommitsAhead(issue.branch)
        ) {
          return { ...issue, tip: branchTip(issue.branch) };
        }
        console.log(
          `  · ${issue.id}: no new commits and branch not ahead of HEAD — skip merge`,
        );
        return undefined;
      } finally {
        try {
          await sandbox.close();
        } catch (reason) {
          console.error(`  · ${issue.id}: sandbox.close failed: ${reason}`);
        }
      }
    } catch (reason) {
      console.error(`  ✗ ${issue.id} (${issue.branch}) failed: ${reason}`);
      return undefined;
    }
  };

  await Promise.all(
    issues.map(async (issue) => {
      const completed = await executeIssue(issue);
      if (completed) await mergeWhenIdle(completed);
    }),
  );
}

console.log("\nAll done.");
