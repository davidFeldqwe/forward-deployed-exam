/**
 * Ghost autocomplete for the Thread composer (issue #27). One muted
 * continuation after a pause; Tab takes the whole thing into the draft.
 * Unaccepted ghost text is never a user message. The live model is reached
 * only through `agent-model.ts`; this module packs the request, mocks, and
 * decides whether a reply is a suggestion.
 */
import { PROMPT_MAX_LENGTH } from "./auth-gate.ts";
import { chatCopy } from "./chat-copy.ts";
import { clip } from "./text.ts";

export const AUTOCOMPLETE_PATH = "/api/autocomplete";
export const GHOST_PAUSE_MS = 400;
export const MOCK_LLM = "MOCK_LLM";
export const RECENT_PROMPT_LIMIT = 3;
/** Inline hint after the cursor: a few words, not a finished question. */
export const GHOST_MAX_WORDS = 4;

const NEW_ENGLAND_QUESTION = chatCopy.chips[0];

export type AutocompletePack = {
  partialPrompt: string;
  recentPrompts: string[];
};

export type ComposerDraft = {
  text: string;
  ghost: string | null;
};

export type Completer = (pack: AutocompletePack) => Promise<string>;

/**
 * Replay for `MOCK_LLM=1`: the rest of the New England sample question when
 * the draft is a proper prefix of it, otherwise nothing. CI never needs a key
 * for this path.
 */
export function mockContinuation(partial: string): string {
  const typed = partial.trim();
  if (typed.length === 0) {
    return "";
  }
  if (
    NEW_ENGLAND_QUESTION.toLowerCase().startsWith(typed.toLowerCase()) &&
    typed.length < NEW_ENGLAND_QUESTION.length
  ) {
    return NEW_ENGLAND_QUESTION.slice(typed.length);
  }
  return "";
}

/** Keep a leading space; take only the first few words of the tail. */
export function clipGhostContinuation(suggestion: string): string {
  const lead = suggestion.match(/^\s*/)?.[0] ?? "";
  const words = suggestion.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return "";
  }
  return `${lead}${words.slice(0, GHOST_MAX_WORDS).join(" ")}`;
}

/** Drop emptiness and an echo of the partial so the ghost is only the tail. Keep a leading space. */
export function normalizeSuggestion(
  partial: string,
  raw: string | null | undefined,
): string | null {
  if (raw == null || raw.trim().length === 0) {
    return null;
  }
  const prefix = partial.trim();
  const suggestion = raw.trimEnd();
  if (suggestion.trim() === prefix) {
    return null;
  }
  const rest =
    prefix.length > 0 && suggestion.toLowerCase().startsWith(prefix.toLowerCase())
      ? suggestion.slice(prefix.length)
      : suggestion;
  if (rest.trim().length === 0) {
    return null;
  }
  const clipped = clipGhostContinuation(rest);
  return clipped.trim().length === 0 ? null : clipped;
}

/**
 * What the autocomplete route is allowed to see: the composer draft and the
 * last three user prompts from this Thread. Extra fields (git, scores) are
 * dropped, not forwarded.
 */
export function packAutocompleteContext(body: unknown): AutocompletePack | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.partialPrompt !== "string") {
    return null;
  }
  const partialPrompt = clip(record.partialPrompt, PROMPT_MAX_LENGTH);
  if (partialPrompt.trim().length === 0) {
    return null;
  }
  const listed = Array.isArray(record.recentPrompts) ? record.recentPrompts : [];
  const recentPrompts = listed
    .filter((item): item is string => typeof item === "string")
    .map((item) => clip(item.trim(), PROMPT_MAX_LENGTH))
    .filter((item) => item.length > 0)
    .slice(-RECENT_PROMPT_LIMIT);
  return { partialPrompt, recentPrompts };
}

export function recentUserPrompts(
  messages: readonly { role: string; text: string }[],
): string[] {
  return messages
    .filter((message) => message.role === "user" && message.text.trim().length > 0)
    .map((message) => message.text)
    .slice(-RECENT_PROMPT_LIMIT);
}

export function isMockLlm(env: Record<string, string | undefined>): boolean {
  return env[MOCK_LLM]?.trim() === "1";
}

export async function autocompleteContinuation(
  body: unknown,
  deps: { mock: boolean; complete: Completer },
): Promise<string | null> {
  const pack = packAutocompleteContext(body);
  if (!pack) {
    return null;
  }
  try {
    const raw = deps.mock ? mockContinuation(pack.partialPrompt) : await deps.complete(pack);
    return normalizeSuggestion(pack.partialPrompt, raw);
  } catch {
    return null;
  }
}

/** The draft the form posts: never the unaccepted continuation. */
export function submittedPrompt(draft: ComposerDraft): string {
  return draft.text;
}

export function showGhost(draft: ComposerDraft, suggestion: string | null | undefined): ComposerDraft {
  return { text: draft.text, ghost: normalizeSuggestion(draft.text, suggestion) };
}

export function acceptGhost(draft: ComposerDraft): ComposerDraft {
  return draft.ghost === null ? draft : { text: `${draft.text}${draft.ghost}`, ghost: null };
}

export function dismissGhost(draft: ComposerDraft): ComposerDraft {
  return { text: draft.text, ghost: null };
}

export function typeDraft(draft: ComposerDraft, nextText: string): ComposerDraft {
  return { text: nextText, ghost: null };
}

const AUTOCOMPLETE_SYSTEM = [
  "Continue the analyst's question about the US airport capacity-pressure screen.",
  "Reply with only a few words that should appear after the partial prompt — a short inline hint, not a finished question.",
  "Do not repeat the partial. Invent no numbers, ranks, composites or lamps.",
  "An empty thread still gets a continuation; earlier prompts are optional context.",
].join(" ");

export function completionRequest(pack: AutocompletePack): { system: string; prompt: string } {
  const recent =
    pack.recentPrompts.length === 0
      ? "No earlier user prompts in this thread."
      : `Recent user prompts in this thread:\n${pack.recentPrompts.map((prompt) => `- ${prompt}`).join("\n")}`;
  return {
    system: AUTOCOMPLETE_SYSTEM,
    prompt: `${recent}\n\nPartial prompt:\n${pack.partialPrompt}`,
  };
}
