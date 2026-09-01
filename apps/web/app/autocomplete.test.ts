import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { PROMPT_MAX_LENGTH } from "./auth-gate.ts";
import { chatCopy } from "./chat-copy.ts";
import {
  AUTOCOMPLETE_PATH,
  GHOST_PAUSE_MS,
  MOCK_LLM,
  RECENT_PROMPT_LIMIT,
  acceptGhost,
  autocompleteContinuation,
  dismissGhost,
  mockContinuation,
  normalizeSuggestion,
  packAutocompleteContext,
  recentUserPrompts,
  showGhost,
  submittedPrompt,
  typeDraft,
  type ComposerDraft,
} from "./autocomplete.ts";
import { assistantMessage, userMessage } from "./thread-messages.ts";

const NEW_ENGLAND = chatCopy.chips[0];
const PREFIX = "Which airports in New England";

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

test("a New England prefix returns the rest of the sample question, and nothing else does", () => {
  const rest = mockContinuation(PREFIX);
  assert.equal(`${PREFIX}${rest}`, NEW_ENGLAND);
  assert.ok(rest.length > 0);
  // Case does not invent a second canned line: the remainder is the sample's.
  assert.equal(
    mockContinuation("which airports in new england"),
    NEW_ENGLAND.slice("which airports in new england".length),
  );
  assert.equal(mockContinuation("Compare congestion at"), "");
  assert.equal(mockContinuation("New England"), "");
  assert.equal(mockContinuation(NEW_ENGLAND), "");
  assert.equal(mockContinuation("  "), "");
});

test("empty, echo, and whitespace suggestions are not a ghost", () => {
  assert.equal(normalizeSuggestion(PREFIX, ""), null);
  assert.equal(normalizeSuggestion(PREFIX, "   "), null);
  assert.equal(normalizeSuggestion(PREFIX, null), null);
  assert.equal(normalizeSuggestion(PREFIX, PREFIX), null);
  assert.equal(normalizeSuggestion(PREFIX, `  ${PREFIX}  `), null);
});

test("a suggestion that repeats the partial keeps only the continuation", () => {
  const rest = " are renovation-investment candidates?";
  assert.equal(normalizeSuggestion(PREFIX, `${PREFIX}${rest}`), rest);
  // A model that already returned only the tail is left as-is.
  assert.equal(normalizeSuggestion(PREFIX, rest), rest);
});

test("the server pack is the partial plus the last three user prompts, truncated, with no git", () => {
  const pack = packAutocompleteContext({
    partialPrompt: `  ${PREFIX}  `,
    recentPrompts: ["first", "second", "third", "fourth"],
    gitDiff: "diff --git a/foo",
  });

  assert.deepEqual(pack, {
    partialPrompt: `  ${PREFIX}  `,
    recentPrompts: ["second", "third", "fourth"],
  });
  assert.equal("gitDiff" in (pack ?? {}), false);
  assert.equal(packAutocompleteContext({ partialPrompt: "   " }), null);
  assert.equal(packAutocompleteContext({ recentPrompts: [PREFIX] }), null);

  const long = "x".repeat(PROMPT_MAX_LENGTH + 8);
  const clipped = packAutocompleteContext({
    partialPrompt: long,
    recentPrompts: [long],
  });
  assert.equal(clipped?.partialPrompt.length, PROMPT_MAX_LENGTH);
  assert.equal(clipped?.recentPrompts[0]?.length, PROMPT_MAX_LENGTH);
  assert.equal(RECENT_PROMPT_LIMIT, 3);
});

test("recent user prompts are the last three questions in the thread", () => {
  const messages = [
    userMessage("one"),
    assistantMessage("ok"),
    userMessage("two"),
    assistantMessage("ok"),
    userMessage("three"),
    assistantMessage("ok"),
    userMessage("four"),
  ];
  assert.deepEqual(recentUserPrompts(messages), ["two", "three", "four"]);
  assert.deepEqual(recentUserPrompts([]), []);
});

test("MOCK_LLM never calls the live completer, and a failure is no suggestion", async () => {
  const boom = async () => {
    throw new Error("paid model");
  };

  assert.equal(
    await autocompleteContinuation(
      { partialPrompt: PREFIX, recentPrompts: ["earlier"] },
      { mock: true, complete: boom },
    ),
    mockContinuation(PREFIX),
  );
  assert.equal(
    await autocompleteContinuation(
      { partialPrompt: "Compare congestion at", recentPrompts: [] },
      { mock: true, complete: boom },
    ),
    null,
  );
  assert.equal(
    await autocompleteContinuation(
      { partialPrompt: PREFIX, recentPrompts: [] },
      { mock: false, complete: boom },
    ),
    null,
  );
  assert.equal(
    await autocompleteContinuation(
      { partialPrompt: PREFIX, recentPrompts: [] },
      { mock: false, complete: async () => "" },
    ),
    null,
  );
});

test("Tab puts the whole continuation in the draft; Escape, typing, or Send drop it", () => {
  const shown: ComposerDraft = showGhost({ text: PREFIX, ghost: null }, mockContinuation(PREFIX));
  assert.equal(shown.ghost, mockContinuation(PREFIX));
  assert.equal(submittedPrompt(shown), PREFIX);

  const accepted = acceptGhost(shown);
  assert.equal(accepted.text, NEW_ENGLAND);
  assert.equal(accepted.ghost, null);
  assert.equal(submittedPrompt(accepted), NEW_ENGLAND);

  assert.deepEqual(dismissGhost(shown), { text: PREFIX, ghost: null });
  assert.deepEqual(typeDraft(shown, `${PREFIX} a`), { text: `${PREFIX} a`, ghost: null });
  assert.equal(submittedPrompt(dismissGhost(shown)), PREFIX);
});

test("the pause is a wait, not a keystroke, and the route is not chat SSE", () => {
  assert.ok(GHOST_PAUSE_MS > 0);
  assert.equal(AUTOCOMPLETE_PATH, "/api/autocomplete");
  assert.equal(MOCK_LLM, "MOCK_LLM");

  const route = new URL("./api/autocomplete/route.ts", import.meta.url);
  assert.ok(existsSync(route), "autocomplete is its own HTTP route");
  const handler = source("./api/autocomplete/route.ts");
  assert.match(handler, /export async function POST/);
  assert.doesNotMatch(handler, /text\/event-stream|streamText/);
  assert.match(handler, /currentSession/);
  assert.match(handler, /isMockLlm/);
});

test("unaccepted ghost text is empty in the editor's text content", () => {
  const node = source("../components/ghost-node.ts");
  assert.match(node, /getTextContent\(\)[^{]*\{\s*return "";/);
  assert.match(node, /class GhostNode extends TextNode/);
});

test("the composer is Lexical: Tab accepts, Escape or Send drops, pause fetches the route", () => {
  const composer = source("../components/Composer.tsx");
  assert.match(composer, /LexicalComposer/);
  assert.match(composer, /KEY_TAB_COMMAND/);
  assert.match(composer, /KEY_ESCAPE_COMMAND/);
  assert.match(composer, /GHOST_PAUSE_MS/);
  assert.match(composer, /AUTOCOMPLETE_PATH/);
  assert.match(composer, /submit/);
  assert.match(source("../components/Chat.tsx"), /<Composer/);
});

test("autocomplete is prompt UX, not a scoring path", () => {
  const design = readFileSync(new URL("../../../DESIGN.md", import.meta.url), "utf8");
  assert.match(design, /autocomplete/i);
  assert.match(design, /ghost/i);
  assert.match(design, /prompt UX/i);
  assert.doesNotMatch(source("./autocomplete.ts"), /queryAirports|scoreUniverse|@repo\/scoring/);
});
