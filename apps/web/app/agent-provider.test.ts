import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_MAX_STEPS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  OPENAI_FALLBACK_MODEL,
  chooseProvider,
} from "./agent-provider.ts";

test("Anthropic is asked first, so a deployment holding both keys uses it", () => {
  assert.deepEqual(
    chooseProvider({ ANTHROPIC_API_KEY: "sk-ant", OPENAI_API_KEY: "sk-oai" }),
    { vendor: "anthropic", model: DEFAULT_ANTHROPIC_MODEL, fallbackModel: null, apiKey: "sk-ant" },
  );
});

test("OpenAI answers when it is the only key, with the PRD's model and fallback", () => {
  assert.deepEqual(chooseProvider({ OPENAI_API_KEY: "sk-oai" }), {
    vendor: "openai",
    model: DEFAULT_OPENAI_MODEL,
    fallbackModel: OPENAI_FALLBACK_MODEL,
    apiKey: "sk-oai",
  });
});

test("either model can be named, and a blank key is no key at all", () => {
  assert.equal(
    chooseProvider({ ANTHROPIC_API_KEY: "sk-ant", ANTHROPIC_MODEL: "claude-sonnet-5" })?.model,
    "claude-sonnet-5",
  );
  assert.equal(
    chooseProvider({ OPENAI_API_KEY: "sk-oai", OPENAI_MODEL: "gpt-4.1" })?.model,
    "gpt-4.1",
  );
  // A key set to "" in a deploy config would otherwise pick a vendor that 401s.
  assert.equal(
    chooseProvider({ ANTHROPIC_API_KEY: "  ", OPENAI_API_KEY: "sk-oai" })?.vendor,
    "openai",
  );
  assert.equal(chooseProvider({}), null);
});

test("the tool-step cap is the PRD's eight", () => {
  assert.equal(AGENT_MAX_STEPS, 8);
});
