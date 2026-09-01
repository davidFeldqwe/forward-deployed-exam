/**
 * The LLM edge, and the only module in this repo that imports a vendor SDK
 * (PRD story 43 and issue #21: scoring purity stays grep-verifiable, and
 * `app/agent-boundary.test.ts` fails the build if a second module reaches for
 * one). Everything above this line — the tools, the screen, the answer objects
 * — runs without a key.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  generateText,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";

import {
  AGENT_MAX_STEPS,
  NO_PROVIDER_ANSWER,
  chooseAutocompleteProvider,
  chooseProvider,
  type ProviderChoice,
} from "./agent-provider.ts";
import { AGENT_TOOL_SPECS, runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { AGENT_TOOLS, type JsonObject, type ToolCall } from "./thread-messages.ts";

/** Deltas the SSE route can forward without importing the vendor stream. */
export type AgentStreamEvent = { type: "text"; delta: string } | { type: "tool"; call: ToolCall };

export type AgentStreamObserver = (event: AgentStreamEvent) => void;

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

/** A composer continuation: no tools, no transcript, one string back. */
export type CompletionRequest = { system: string; prompt: string };

export type ModelAnswer = { text: string; toolCalls: ToolCall[] };

/**
 * A model object as the SDK hands one back, so a caller — or a test with a
 * scripted model — can name one without importing a vendor package itself.
 */
export type AgentLanguageModel = Exclude<LanguageModel, string>;

/** A call that already has a model: the provider wrapper only constructs one. */
type WithModel<T> = (model: AgentLanguageModel) => Promise<T>;

/**
 * The signed-in ask: the tool loop as a stream. The SSE chat route (#65)
 * builds its pending row and tool rows from this. Nothing partial comes back
 * here: the ranking is drawn from a finished `queryAirports` payload, never
 * from a half-read one.
 */
export function streamAgentModel(
  request: AgentRequest,
  onEvent?: AgentStreamObserver,
): Promise<ModelAnswer> {
  return withProvider(chooseProvider, (model) => streamModelAnswer(model, request, onEvent));
}

/**
 * One continuation for the composer ghost. No tools: a ranking number must not
 * be invented on the way into the draft. Failures are the route's to swallow.
 */
export function completePrompt(request: CompletionRequest): Promise<string> {
  return withProvider(chooseAutocompleteProvider, (model) => generateCompletion(model, request));
}

/** The same one-shot generate, so a test can script the model without a key. */
export async function generateCompletion(
  model: AgentLanguageModel,
  request: CompletionRequest,
): Promise<string> {
  const { text } = await generateText({
    model,
    system: request.system,
    prompt: request.prompt,
  });
  return text;
}

/**
 * Construct a vendor model and run `work`. The PRD names one OpenAI fallback:
 * a deployment whose account cannot see `gpt-4o` should retry on `gpt-4o-mini`.
 * Autocomplete uses the same retry only when that provider choice still has a
 * fallback — a named cheaper model does not get a second paid call.
 */
async function withProvider<T>(
  choose: (env: Record<string, string | undefined>) => ProviderChoice | null,
  work: WithModel<T>,
): Promise<T> {
  const choice = choose(process.env);
  if (!choice) {
    throw new NoProviderError();
  }

  try {
    return await work(languageModel(choice));
  } catch (error) {
    if (choice.fallbackModel === null || !isModelUnavailable(error)) {
      throw error;
    }
    return await work(languageModel({ ...choice, model: choice.fallbackModel }));
  }
}

/**
 * The loop as a stream, ending in one stored answer: the tools record the
 * payloads, and the prose is the accumulated deltas.
 */
export async function streamModelAnswer(
  model: AgentLanguageModel,
  request: AgentRequest,
  onEvent?: AgentStreamObserver,
): Promise<ModelAnswer> {
  let failure: unknown = null;
  const toolCalls: ToolCall[] = [];
  const result = streamText({
    ...modelCall(model, request, toolCalls, onEvent),
    // `streamText` puts a failed call on the stream instead of throwing it, and
    // the promise below then rejects with a NoOutputGeneratedError carrying no
    // cause. Keep the vendor's own error: the fallback above reads it, and the
    // thread would otherwise report an SDK detail as the model's failure.
    onError: ({ error }) => {
      failure ??= error;
    },
  });

  let text = "";
  try {
    for await (const delta of result.textStream) {
      text += delta;
      if (delta.length > 0) {
        onEvent?.({ type: "text", delta });
      }
    }
  } catch (error) {
    throw failure ?? error;
  }
  // An error after a step finished still leaves an answer that stopped early;
  // half a ranking is not what the thread stores.
  if (failure !== null) {
    throw failure;
  }
  return { text, toolCalls };
}

function modelCall(
  model: AgentLanguageModel,
  request: AgentRequest,
  recorded: ToolCall[],
  onEvent?: AgentStreamObserver,
) {
  return {
    model,
    system: request.system,
    messages: request.messages.map(
      (turn): ModelMessage => ({ role: turn.role, content: turn.content }),
    ),
    tools: instrumentedTools(recorded, onEvent),
    // PRD "Stack": cap tool steps, eight is enough.
    stopWhen: stepCountIs(AGENT_MAX_STEPS),
  };
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
function instrumentedTools(recorded: ToolCall[], onEvent?: AgentStreamObserver): ToolSet {
  return Object.fromEntries(
    AGENT_TOOLS.map((tool) => [
      tool,
      {
        description: AGENT_TOOL_SPECS[tool].description,
        inputSchema: AGENT_TOOL_SPECS[tool].inputSchema,
        execute: (args: unknown) => {
          const startedAt = performance.now();
          const result = toolPayloadJson(runAgentTool(tool, args));
          const call: ToolCall = {
            tool,
            args: (args ?? {}) as JsonObject,
            result,
            durationMs: performance.now() - startedAt,
          };
          recorded.push(call);
          onEvent?.({ type: "tool", call });
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
