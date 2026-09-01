import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { CHAT_PATH, chatDestination } from "./auth-gate.ts";
import { chatCopy } from "./chat-copy.ts";
import { threadRail } from "./thread-rail.ts";
import type { ThreadSummary } from "./thread-store.ts";

const web = new URL("../", import.meta.url);
const repo = new URL("../../", web);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

const RECENTS: readonly ThreadSummary[] = [
  { id: "b2", title: "Which airports in New England are renovation-investment candidates?" },
  { id: "a1", title: "Compare congestion at Los Angeles and Santa Ana." },
];

/** Every place the rail can send the analyst, current-first. */
function currentDestinations(openThreadId: string | null): string[] {
  const rail = threadRail(RECENTS, openThreadId);
  return [rail.newThread, ...rail.rows]
    .filter((destination) => destination.current)
    .map((destination) => destination.href);
}

test("the rail lists the analyst's threads by first question, newest first", () => {
  const { rows } = threadRail(RECENTS, null);

  assert.deepEqual(
    rows.map((row) => row.title),
    RECENTS.map((thread) => thread.title),
  );
  assert.deepEqual(
    rows.map((row) => row.href),
    RECENTS.map((thread) => chatDestination(thread.id)),
  );
});

test("the open thread is the one current row", () => {
  assert.deepEqual(currentDestinations("a1"), [chatDestination("a1")]);
  assert.deepEqual(currentDestinations("b2"), [chatDestination("b2")]);
});

test("an empty chat makes New thread the current destination and no row current", () => {
  assert.deepEqual(currentDestinations(null), [CHAT_PATH]);
});

test("a thread the recents list does not hold leaves nothing marked current", () => {
  // A restart drops the store: the route still carries an id, and the rail says
  // so by lighting nothing rather than lighting the empty chat.
  assert.deepEqual(currentDestinations("gone"), []);
});

test("empty recents still offers New thread, and the copy explains the empty list", () => {
  const rail = threadRail([], null);

  assert.deepEqual(rail.rows, []);
  assert.equal(rail.newThread.href, CHAT_PATH);
  assert.match(chatCopy.noRecentsLabel, /ask a question to start one/i);
});

test("the rail is a labelled list of thread links, and marks the open one", () => {
  const rail = source("components/ThreadRail.tsx");

  assert.match(rail, /threadRail\(/);
  assert.match(rail, /aria-current=\{[^}]*"page"/);
  assert.match(rail, /chatCopy\.newThreadLabel/);
  assert.match(rail, /chatCopy\.noRecentsLabel/);
  // A long first question is clipped to the row, not wrapped into a paragraph.
  assert.match(rail, /truncate/);
});

test("the rail is the dense dark list and nothing else", () => {
  const rail = source("components/ThreadRail.tsx");

  // Near-black, flush with the header, with a thin edge against the transcript.
  assert.match(rail, /bg-sidebar\b/);
  assert.match(rail, /border-e/);
  // The open thread is a quiet rounded rect: no accent stripe, no loud fill.
  assert.match(rail, /rounded-md/);
  assert.doesNotMatch(rail, /bg-primary|border-s-2|border-l-2/);
  // Reference chrome this product does not have.
  for (const forbidden of [/search/i, /folder/i, /settled/i, /show more/i, /unread/i]) {
    assert.doesNotMatch(rail, forbidden, String(forbidden));
  }
});

test("rows press at a slight scale, and hover paint waits for a fine pointer", () => {
  const rail = source("components/ThreadRail.tsx");
  const styles = readFileSync(new URL("app/globals.css", web), "utf8");

  assert.match(rail, /active:scale-\[0\.97\]/);
  assert.match(rail, /data-thread-row/);
  // Hover is a pointer state, so a tap must not leave a row lit behind it.
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\) \{\s*\[data-thread-row\]:hover/);
  assert.doesNotMatch(rail, /hover:bg-/);
});

test("switching threads is instant; only the narrow-viewport drawer slides", () => {
  const rail = source("components/ThreadRail.tsx");

  // The slide is the drawer opening on a narrow viewport, and it is gated to
  // that viewport: a thread switch on a desktop rail moves nothing.
  assert.match(rail, /max-md:transition-\[transform,opacity,visibility\]/);
  assert.match(rail, /ease-\[var\(--ease-drawer\)\]/);
  assert.doesNotMatch(rail, /ease-in\b|animate-in/);
  // Reduced motion keeps the fade and drops the movement.
  assert.match(rail, /motion-reduce:max-md:transition-\[opacity,visibility\]/);
});

test("the shared header leads with the drawer control and keeps the window", () => {
  const chat = source("components/Chat.tsx");

  // `\b` after `ThreadRail`: the rail itself, not the header control for it.
  assert.match(chat, /<ThreadRail\b/);
  assert.match(chat, /leading=\{<ThreadRailToggle/);
  // The window is the shared bar's now, handed to its `status` slot; the
  // header's own test pins the strings.
  assert.match(chat, /status=\{<ComparisonWindow/);
});

test("the drawer control names the list it opens, and points at that same list", () => {
  const rail = source("components/ThreadRail.tsx");

  // One id shared by the rail and the control, so `aria-controls` cannot drift
  // away from the element it names.
  assert.match(rail, /id=\{RAIL_ID\}/);
  assert.match(rail, /aria-controls=\{RAIL_ID\}/);
  // The control says whether the drawer is open, and is gone from `md` up.
  assert.match(rail, /aria-expanded=\{open\}/);
  assert.match(rail, /md:hidden/);
  assert.match(rail, /chatCopy\.showRecentsLabel/);
  assert.match(rail, /chatCopy\.hideRecentsLabel/);
});

test("the header recents menu is gone", () => {
  assert.equal(existsSync(new URL("components/ThreadMenu.tsx", web)), false);
  assert.doesNotMatch(source("components/Chat.tsx"), /ThreadMenu/);
});

test("the PRD and the coding standards make the rail the locked chrome", () => {
  const prd = readFileSync(new URL("PRD.md", repo), "utf8");
  const standards = readFileSync(new URL(".sandcastle/CODING_STANDARDS.md", repo), "utf8");

  // Story 17 is the rail now, not a header control that avoids one.
  const story17 = prd.split("\n").find((line) => line.startsWith("17. "));
  assert.ok(story17, "story 17");
  assert.match(story17, /left (?:thread )?rail/i);
  assert.doesNotMatch(story17, /without a left rail/i);

  // The old bans are lifted in both places that carried them.
  const outOfScope = prd.slice(prd.indexOf("## Out of Scope")).split("\n## ")[0] ?? "";
  assert.doesNotMatch(outOfScope, /thread rail/i);
  assert.match(standards, /left thread rail/i);
  assert.doesNotMatch(standards, /no thread rail/i);
});
