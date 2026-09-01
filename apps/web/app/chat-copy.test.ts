import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { chatCopy } from "./chat-copy.ts";
import { landingCopy } from "./landing-copy.ts";
import { siteHeaderCopy } from "./site-header.ts";

const chatChrome = readFileSync(new URL("../components/Chat.tsx", import.meta.url), "utf8");
const composerChrome = readFileSync(new URL("../components/Composer.tsx", import.meta.url), "utf8");
const askOnChatSseSource = readFileSync(new URL("./chat-ask.ts", import.meta.url), "utf8");

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

test("the wordmark and the window are the shared header's, not second copies", () => {
  assert.equal("wordmark" in chatCopy, false);
  assert.equal("comparisonWindow" in chatCopy, false);
  assert.equal("comparisonWindowYears" in chatCopy, false);
  assert.equal(siteHeaderCopy.wordmark, "Airport Investment Intelligence Agent");
  // `site-header.test.ts` holds the phrase-and-years pair itself.
  assert.match(siteHeaderCopy.comparisonWindow, /Comparison window/);
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

test("composer is a single send field that says when a question is in flight", () => {
  assert.equal(chatCopy.composerPlaceholder, "Ask about an airport…");
  // Accessible name of the submit control — the visible chrome is an arrow.
  assert.equal(chatCopy.sendLabel, "Send");
  // Send is held while the question is being persisted, so the label has to
  // say why it cannot be clicked again.
  assert.match(chatCopy.sendingLabel, /^Sending/);
  assert.notEqual(chatCopy.sendingLabel, chatCopy.sendLabel);
});

test("submit is an upward arrow whose accessible name is send, not the word Send", () => {
  assert.match(chatChrome, /ArrowUpIcon aria-hidden="true"/);
  assert.match(chatChrome, /aria-label=\{pending \? chatCopy\.sendingLabel : chatCopy\.sendLabel\}/);
  assert.doesNotMatch(
    chatChrome,
    />\s*\{pending \? chatCopy\.sendingLabel : chatCopy\.sendLabel\}\s*</,
  );
});

test("empty draft cannot activate send; a ready draft stays enabled unless in flight", () => {
  assert.match(chatChrome, /disabled=\{!ready \|\| pending\}/);
  // Enter posts through `requestSubmit`, which would skip a disabled button unless
  // the composer checks that control first.
  assert.match(composerChrome, /button\[type="submit"\]/);
  assert.match(composerChrome, /send\.disabled/);
});

test("send clears the composer as soon as the question is accepted", () => {
  // The field the analyst types in is emptied on submit. The pending user turn
  // keeps the words; leftover composer text would look like a second Send away.
  assert.match(chatChrome, /onSubmit=\{acceptQuestion\}/);
  assert.match(chatChrome, /setAsked\(question\)/);
  assert.match(chatChrome, /setDraft\(""\)/);
  assert.match(chatChrome, /<PendingAnswer question=\{asked\}/);
  assert.match(chatChrome, /const ready = draft\.trim\(\)\.length > 0/);
  // The form still posts those words after the field is empty.
  assert.match(composerChrome, /name="prompt"/);
  assert.match(composerChrome, /value=\{formValue\}/);
});

test("a long draft wraps and scrolls inside the field instead of clipping sideways", () => {
  const field = composerChrome.match(/<ContentEditable[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(field, /min-h-8/);
  assert.match(field, /max-h-/);
  assert.match(field, /overflow-y-auto/);
  assert.doesNotMatch(field, /whitespace-nowrap/);
  assert.doesNotMatch(field, /overflow-y-hidden/);
});

test("placeholder and a one-line draft sit on the send control's midline", () => {
  const field = composerChrome.match(/<ContentEditable[\s\S]*?\/>/)?.[0] ?? "";
  const placeholder = composerChrome.match(/placeholder=\{\s*<div[\s\S]*?<\/div>/)?.[0] ?? "";
  // The field's one-row height is the Send control (icon-sm size-8). Growing
  // wraps downward; items-end keeps Send on that first-row midline until then.
  assert.match(field, /min-h-8/);
  assert.match(field, /leading-6/);
  assert.match(field, /\[&_p\]:my-0/);
  assert.match(placeholder, /absolute inset-0/);
  assert.match(placeholder, /items-center/);
  assert.match(chatChrome, /InputGroup className="[^"]*items-end/);
  assert.match(chatChrome, /InputGroupAddon align="inline-end" className="py-0"/);
});

test("header and composer stay on screen; the transcript is the region that shrinks", () => {
  assert.match(chatChrome, /h-svh/);
  assert.match(chatChrome, /shrink-0 border-t/);
  assert.match(chatChrome, /min-h-0 flex-1[^"]*overflow-y-auto/);
});

test("empty submit without JavaScript does not create a user turn", () => {
  assert.match(askOnChatSseSource, /carriedPrompt/);
  assert.match(askOnChatSseSource, /if \(!question\) \{\s*return;/);
  assert.match(askOnChatSseSource, /fetch\(CHAT_SSE_PATH/);
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

test("sign out is the shared header's profile control, not chat copy", () => {
  assert.equal("signOutLabel" in chatCopy, false);
  assert.equal(siteHeaderCopy.signOutLabel, "Sign out");
});

test("the thread rail is Recents and New thread, in the glossary's words", () => {
  assert.equal(chatCopy.recentsLabel, "Recents");
  assert.equal(chatCopy.newThreadLabel, "New thread");
  assert.match(chatCopy.noRecentsLabel, /No threads yet/);
  // The narrow-viewport control names the same list it shows and hides.
  assert.match(chatCopy.showRecentsLabel, /recents/i);
  assert.match(chatCopy.hideRecentsLabel, /recents/i);

  const text = visibleText(chatCopy);
  // The rail is a layout word, not a product one: the list on screen is
  // Recents, and CONTEXT.md's Thread entry rules out chat history as its name.
  for (const forbidden of ["rail", "sidebar", "Chat history", "History"]) {
    assert.equal(text.includes(forbidden), false, `should not mention ${forbidden}`);
  }
});
