import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Issue #58 / PRD story 37: a reviewer clones this repo and runs the `next` the
 * manifest pins. The App Router and Server Components advisories published
 * against the 15.5 Maintenance LTS line are fixed by patch releases, so the pin
 * is a floor with a reason behind it, not a number left where the scaffold put
 * it. The floor is the highest patched-from version among those advisories; the
 * ceiling keeps this repo on 15.5, because a major move is not this issue.
 */
const PATCHED_FROM = "15.5.21";
const BELOW = "15.6.0";

/** A release as `major.minor.patch`, the only shape a pin here is written in. */
type Release = number[];

function release(text: string): Release {
  const parts = text.split(".").map(Number);
  assert.ok(
    parts.length === 3 && parts.every(Number.isInteger),
    `${text} is a major.minor.patch release`,
  );
  return parts;
}

/** Older than, as the release line reads it: 15.5.9 comes before 15.5.21. */
function isBefore(left: string, right: string): boolean {
  const gaps = release(left).map((part, index) => part - release(right)[index]);
  return (gaps.find((gap) => gap !== 0) ?? 0) < 0;
}

function json(path: string): { version?: string; dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}

/** What `apps/web` pins, and what a `pnpm install` off this lockfile actually put there. */
const pinned = json("../package.json").dependencies?.next;
const installed = json("../node_modules/next/package.json").version;

test("the pinned next is a 15.5 patch that clears the published advisories", () => {
  assert.ok(pinned, "apps/web depends on next");
  assert.ok(!isBefore(pinned, PATCHED_FROM), `next is pinned to ${pinned}, below ${PATCHED_FROM}`);
  assert.ok(isBefore(pinned, BELOW), `next is pinned to ${pinned}, off the 15.5 line`);
});

test("the next a fresh clone installs is the one the manifest pins", () => {
  assert.equal(installed, pinned);
});
