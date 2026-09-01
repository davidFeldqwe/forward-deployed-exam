/**
 * Which LLM answers, and how far it may go. Separate from `agent-model.ts` so
 * the choice is testable without loading a vendor SDK, and so the one module
 * that does import one stays as small as the boundary it guards.
 */

/**
 * PRD "Stack": cap tool steps, eight is enough. A ranking is two calls —
 * `describeMethodology` then `queryAirports` — so eight leaves room for a
 * correction without letting a confused model loop on the screen.
 */
export const AGENT_MAX_STEPS = 8;

/** PRD story 40: these two names, in this order, and never an OAuth token. */
export const ANTHROPIC_KEY = "ANTHROPIC_API_KEY";
export const OPENAI_KEY = "OPENAI_API_KEY";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
export const DEFAULT_OPENAI_MODEL = "gpt-4o";
/** PRD "Stack": `gpt-4o` first, `gpt-4o-mini` if that model is not available. */
export const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";
/** Optional cheaper name for the composer ghost; same key family as chat. */
export const AUTOCOMPLETE_MODEL = "AUTOCOMPLETE_MODEL";

export type ProviderChoice = {
  vendor: "anthropic" | "openai";
  model: string;
  /** Tried once if `model` is refused; Anthropic has no second name to try. */
  fallbackModel: string | null;
  apiKey: string;
};

/** What a thread says when the deployment has no key: no answer, and no numbers. */
export const NO_PROVIDER_ANSWER =
  `This deployment has no LLM key, so the question is stored but unanswered. Set ${ANTHROPIC_KEY}, ` +
  `or ${OPENAI_KEY}, and ask again. The capacity-pressure screen itself needs no key: it is a ` +
  "committed snapshot scored in this repo.";

/**
 * OpenAI as the PRD's second vendor: used when Anthropic is absent, and again
 * when Anthropic was asked and failed. A deploy that only holds this key must
 * still answer; one that holds a dead Anthropic key must not stay silent.
 */
export function chooseOpenAIProvider(
  env: Record<string, string | undefined>,
): ProviderChoice | null {
  const openaiKey = trimmed(env[OPENAI_KEY]);
  if (!openaiKey) {
    return null;
  }
  const model = trimmed(env.OPENAI_MODEL) ?? DEFAULT_OPENAI_MODEL;
  return {
    vendor: "openai",
    model,
    fallbackModel: model === OPENAI_FALLBACK_MODEL ? null : OPENAI_FALLBACK_MODEL,
    apiKey: openaiKey,
  };
}

/**
 * The vendor to call, or null when the deployment holds no key. Anthropic wins
 * when both are set. A key that is present but blank is not a key: a deploy
 * config that defines the variable empty would otherwise pick a vendor that
 * answers every question with a 401.
 */
export function chooseProvider(env: Record<string, string | undefined>): ProviderChoice | null {
  const anthropicKey = trimmed(env[ANTHROPIC_KEY]);
  if (anthropicKey) {
    return {
      vendor: "anthropic",
      model: trimmed(env.ANTHROPIC_MODEL) ?? DEFAULT_ANTHROPIC_MODEL,
      fallbackModel: null,
      apiKey: anthropicKey,
    };
  }
  return chooseOpenAIProvider(env);
}

/**
 * The next vendor after a failed call. Anthropic has no second model name, so
 * the retry is OpenAI when that key is present. OpenAI already named its own
 * cheaper model on the choice; there is no third vendor after that.
 */
export function providerAfterFailure(
  failed: ProviderChoice,
  env: Record<string, string | undefined>,
): ProviderChoice | null {
  return failed.vendor === "anthropic" ? chooseOpenAIProvider(env) : null;
}

/**
 * The composer ghost uses the same vendor and key as chat. A named cheaper
 * model is allowed; without one, the chat model answers here too.
 */
export function chooseAutocompleteProvider(
  env: Record<string, string | undefined>,
): ProviderChoice | null {
  const choice = chooseProvider(env);
  if (!choice) {
    return null;
  }
  const model = trimmed(env[AUTOCOMPLETE_MODEL]);
  // A named ghost model that the account cannot see is silence, not a second
  // paid call: failure on this route means no suggestion.
  return model === null ? choice : { ...choice, model, fallbackModel: null };
}

function trimmed(value: string | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length === 0 ? null : text;
}
