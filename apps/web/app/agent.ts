/**
 * The signed-in agent: a question, the thread it is asked in, and the answer
 * that comes back as one assistant message carrying the tool payloads the
 * ranking re-renders from. No SDK import — `app/agent-model.ts` owns that edge,
 * which is also why the runner is a parameter here.
 */
import { NO_PROVIDER_ANSWER } from "./agent-provider.ts";
import { NoProviderError, runAgentModel, type AgentRequest, type ModelAnswer } from "./agent-model.ts";
import { assistantMessage, type ThreadMessage } from "./thread-messages.ts";

export type AgentRunner = (request: AgentRequest) => Promise<ModelAnswer>;

/**
 * The rules the boundary rests on: the model resolves a place phrase and writes
 * the prose; every number, rank and airport comes from a tool. The transcript
 * draws the resolved set, the ranking, the score vector and the caveats from
 * those payloads, so prose that restates the table can only disagree with it.
 */
export const AGENT_SYSTEM_PROMPT = [
  "You are the Airport Investment Intelligence agent. You answer from a committed capacity-pressure",
  "screen of the largest US airports, using two tools and nothing else: queryAirports and",
  "describeMethodology.",
  "",
  "Never state a number, a rank, a composite, a lamp or an airport that a tool did not return in this",
  "conversation. If you have not called a tool yet, call one.",
  "",
  "Place resolution is yours, but it is a lookup, not a guess: region is one of the nine US Census",
  "divisions, state is a two-letter code, municipality is the snapshot's city name, peerGroup is an",
  "FAA hub size. Call describeMethodology when you are unsure which value a phrase maps to. Never",
  "invent an airport code to filter on. If queryAirports reports unknownPlace or unknownIata, say so",
  "and quote the accepted phrases rather than trying a nearby guess.",
  "",
  "The interface already renders the resolved airport set, the ranking table, each row's score vector",
  "and this answer's assumptions and gaps from the tool payload. Do not repeat the table as prose.",
  "Write at most three short paragraphs: what the resolved set is, which rows clear the",
  "strong-candidate band and why, and what a withheld composite means.",
  "",
  "Percentiles are within an airport's FAA hub-size peer group, computed nationally. A region",
  "question filters that national ranking; it never re-ranks a region against itself, and percentiles",
  "from two peer groups are not comparable. A missing input is absent data, never a low score, and an",
  "airport missing one has no composite. Construction cost, ROI, land, politics and airline leases are",
  "outside this screen; say so rather than estimating them.",
].join("\n");

/** What the thread shows when the model itself failed: no numbers, no pretence. */
export const AGENT_ERROR_ANSWER =
  "The agent could not finish this answer. The question is saved — ask again, or open the tool rows " +
  "above to see how far it got. No ranking is shown because none was returned.";

/**
 * The answer to the newest question in `messages`. Prose and tool calls both
 * come back on one assistant message: the message list is the only record of an
 * answer, so a payload that is not stored here cannot be re-rendered later.
 */
export async function answerQuestion(
  messages: readonly ThreadMessage[],
  run: AgentRunner = runAgentModel,
): Promise<ThreadMessage> {
  try {
    const answer = await run({
      system: AGENT_SYSTEM_PROMPT,
      messages: messages.map((message) => ({ role: message.role, content: message.text })),
    });
    return assistantMessage(answer.text.trim(), answer.toolCalls);
  } catch (error) {
    return assistantMessage(error instanceof NoProviderError ? NO_PROVIDER_ANSWER : AGENT_ERROR_ANSWER);
  }
}
