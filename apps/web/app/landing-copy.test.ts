import assert from "node:assert/strict";
import { test } from "node:test";

import { landingCopy } from "./landing-copy.ts";

function visibleText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(visibleText).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map(visibleText).join("\n");
  }
  return "";
}

test("the header is not Landing copy: identity and actions are shared chrome", () => {
  // `app/site-header.ts` owns the wordmark and the bar's actions, so Landing
  // and chat cannot drift apart. `site-header.test.ts` pins that contract.
  assert.equal("header" in landingCopy, false);
});

test("hero names the capacity-pressure screen and offers Start asking only", () => {
  assert.equal(
    landingCopy.hero.title,
    "Airport Investment Intelligence Agent.",
  );
  assert.match(landingCopy.hero.subtitle, /capacity-pressure screen/i);
  assert.match(landingCopy.hero.subtitle, /ranked/i);
  assert.match(landingCopy.hero.subtitle, /scores from public data/i);
  assert.match(landingCopy.hero.subtitle, /assumptions/i);
  assert.deepEqual(landingCopy.hero.actions, [
    { label: "Start asking", href: "/chat" },
  ]);
});

test("demo card is a two-row LAX and SNA fixture, not a live scoring path", () => {
  assert.equal(landingCopy.demo.prompt, "Compare congestion at LAX and SNA.");
  assert.ok(landingCopy.demo.prose.length > 0);
  assert.doesNotMatch(landingCopy.demo.prose, /live demo/i);
  assert.deepEqual([...landingCopy.demo.columns], [
    "Airport",
    "Delay rate",
    "Avg delay",
  ]);
  assert.deepEqual(
    landingCopy.demo.rows.map((row) => row.airport),
    ["LAX", "SNA"],
  );
  assert.equal(landingCopy.demo.rows.length, 2);
});

test("built on lists Next.js, Convex, and Vercel AI SDK", () => {
  assert.deepEqual([...landingCopy.builtOn], [
    "Next.js",
    "Convex",
    "Vercel AI SDK",
  ]);
});

test("suggested questions use glossary language", () => {
  const questions = landingCopy.suggestedQuestions.join(" ");
  assert.match(questions, /renovation-investment candidate/i);
  assert.match(questions, /New England/);
  assert.match(questions, /Los Angeles/);
  assert.match(questions, /Santa Ana/);
  assert.match(questions, /long-haul share/i);
  assert.match(questions, /Anchorage/);
  assert.match(questions, /unmet flight demand/i);
  assert.match(questions, /SFO/);
  assert.equal(landingCopy.suggestedQuestions.length, 4);
});

test("how it works is five steps ending in snapshot vintage, not a live refresh", () => {
  assert.equal(landingCopy.howItWorks.heading, "How it works");
  assert.deepEqual([...landingCopy.howItWorks.steps], [
    "Ask in plain English",
    "Chat UI (streaming)",
    "Agent tools",
    "Committed snapshot",
    "Public source vintage",
  ]);
  assert.match(landingCopy.howItWorks.caption, /snapshot vintage/i);
  assert.doesNotMatch(landingCopy.howItWorks.caption, /weekly live refresh/i);
});

test("privacy strip logs email and questions and does not sell data", () => {
  assert.match(landingCopy.privacy, /email/i);
  assert.match(landingCopy.privacy, /questions/i);
  assert.match(landingCopy.privacy, /never sell/i);
});

test("GitHub appears only as a footer link to this repo", () => {
  assert.equal(
    landingCopy.footer.githubHref,
    "https://github.com/davidFeldqwe/forward-deployed-exam",
  );
  assert.equal(landingCopy.footer.githubLabel, "GitHub");
});

test("landing copy does not advertise dropped stack or surfaces", () => {
  const text = visibleText(landingCopy);
  for (const forbidden of [
    "FastAPI",
    "LangGraph",
    "Neon",
    "Clerk",
    "Cloud Run",
    "Langfuse",
    "3D map",
    "3d map",
  ]) {
    assert.equal(text.includes(forbidden), false, `should not mention ${forbidden}`);
  }
});
