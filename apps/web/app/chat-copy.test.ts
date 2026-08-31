import assert from "node:assert/strict";
import { test } from "node:test";

import { chatCopy } from "./chat-copy.ts";
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

test("header wordmark matches landing and names the comparison window", () => {
  assert.equal(chatCopy.wordmark, landingCopy.header.wordmark);
  assert.match(chatCopy.comparisonWindow, /Comparison window/);
  assert.match(chatCopy.comparisonWindow, /2023/);
  assert.match(chatCopy.comparisonWindow, /2024/);
});

test("empty-state chips are the same prompts as the Landing suggested questions", () => {
  assert.deepEqual(chatCopy.chips, landingCopy.suggestedQuestions);
  assert.equal(chatCopy.chips.length, 4);
});

test("empty state has no thesis paragraph", () => {
  assert.equal("thesis" in chatCopy, false);
  const text = visibleText(chatCopy);
  assert.doesNotMatch(text, /ranked, explained, number-backed/i);
  assert.doesNotMatch(text, /A capacity-pressure screen/i);
});

test("composer is a single send field", () => {
  assert.equal(chatCopy.composerPlaceholder, "Ask about an airport…");
  assert.equal(chatCopy.sendLabel, "Send");
});

test("chat chrome does not advertise dropped surfaces or a live scoring path", () => {
  const text = visibleText(chatCopy);
  for (const forbidden of [
    "3D map",
    "3d map",
    "Rankings",
    "dossier",
    "queryAirports",
    "Methodology",
  ]) {
    assert.equal(text.includes(forbidden), false, `should not mention ${forbidden}`);
  }
});
