/**
 * The LLM edge, and the only module in this repo that imports a vendor SDK
 * (PRD story 43 and issue #21: scoring purity stays grep-verifiable, and
 * `app/agent-boundary.test.ts` fails the build if a second module reaches for
 * one). Everything above this line — the tools, the screen, the answer objects
 * — runs without a key.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";

import {
  AGENT_MAX_STEPS,
  NO_PROVIDER_ANSWER,
  chooseProvider,
  type ProviderChoice,
} from "./agent-provider.ts";
import { AGENT_TOOL_SPECS, runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { AGENT_TOOLS, type JsonObject, type ToolCall } from "./thread-messages.ts";

/** The deployment holds neither key, so there is nobody to ask. */
export class NoProviderError extends Error {
  constructor() {
    super(NO_PROVIDER_ANSWER);
    this.name = "NoProviderError";
  }
}

/** One turn as the model sees it: prose only — the payloads are re-fetched. */
export type AgentTurn = { role: "user" | "assistant"; content: string };

export type AgentRequest = { system: string; messages: readonly AgentTurn[] };

export type ModelAnswer = { text: string; toolCalls: ToolCall[] };

/**
 * Runs the tool loop and returns the prose beside every tool call it made, in
 * the order it made them. The calls are recorded here rather than read back off
 * the SDK's steps because the transcript stores what the tool actually returned
 * and how long it took — that payload is what the ranking re-renders from.
 */
export async function runAgentModel(request: AgentRequest): Promise<ModelAnswer> {
  const choice = chooseProvider(process.env);
  if (!choice) {
    throw new NoProviderError();
  }

  try {
    return await generate(choice, request);
  } catch (error) {
    // The PRD names one OpenAI fallback: a deployment whose account cannot see
    // `gpt-4o` should answer on `gpt-4o-mini` rather than not answer at all.
    if (choice.fallbackModel === null || !isModelUnavailable(error)) {
      throw error;
    }
    return await generate({ ...choice, model: choice.fallbackModel }, request);
  }
}

async function generate(choice: ProviderChoice, request: AgentRequest): Promise<ModelAnswer> {
  const toolCalls: ToolCall[] = [];
  const { text } = await generateText({
    model: languageModel(choice),
    system: request.system,
    messages: request.messages.map(
      (turn): ModelMessage => ({ role: turn.role, content: turn.content }),
    ),
    tools: instrumentedTools(toolCalls),
    // PRD "Stack": cap tool steps, eight is enough.
    stopWhen: stepCountIs(AGENT_MAX_STEPS),
  });
  return { text, toolCalls };
}

/** The one place either vendor's client is constructed. */
function languageModel({ vendor, apiKey, model }: ProviderChoice) {
  const provider = vendor === "anthropic" ? createAnthropic({ apiKey }) : createOpenAI({ apiKey });
  return provider(model);
}

/**
 * The two tools, each wrapped so the call it made is kept. The payload is put
 * through the same JSON round trip the store will do, so what the model reads
 * and what the transcript re-renders are the one object.
 */
function instrumentedTools(recorded: ToolCall[]): ToolSet {
  return Object.fromEntries(
    AGENT_TOOLS.map((tool) => [
      tool,
      {
        description: AGENT_TOOL_SPECS[tool].description,
        inputSchema: AGENT_TOOL_SPECS[tool].inputSchema,
        execute: (args: unknown) => {
          const startedAt = performance.now();
          const result = toolPayloadJson(runAgentTool(tool, args));
          recorded.push({
            tool,
            args: (args ?? {}) as JsonObject,
            result,
            durationMs: performance.now() - startedAt,
          });
          return result;
        },
      },
    ]),
  );
}

// Only a model this account cannot reach earns the second attempt: a rate limit
// or an outage would otherwise be paid for twice on a model just as unavailable.
function isModelUnavailable(error: unknown): boolean {
  const status = (error as { statusCode?: unknown })?.statusCode;
  if (status === 404) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("model_not_found") || /model.*(not found|does not exist)/.test(message);
}
