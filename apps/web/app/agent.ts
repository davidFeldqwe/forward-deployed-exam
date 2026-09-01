/**
 * The signed-in agent: a question, the thread it is asked in, and the answer
 * that comes back as one assistant message carrying the tool payloads the
 * ranking re-renders from. No SDK import — `app/agent-model.ts` owns that edge,
 * which is also why the runner is a parameter here.
 */
import {
  NoProviderError,
  streamAgentModel,
  type AgentRequest,
  type ModelAnswer,
} from "./agent-model.ts";
import { NO_PROVIDER_ANSWER } from "./agent-provider.ts";
import { ACCEPTED_PLACE_PHRASES, OFF_THESIS_REFUSAL } from "./refusals.ts";
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
  "screen of every US primary commercial airport, using two tools and nothing else: queryAirports and",
  "describeMethodology.",
  "",
  "Never state a number, a rank, a composite, a lamp or an airport that a tool did not return in this",
  "conversation. If you have not called a tool yet, call one.",
  "",
  "Place resolution is yours, but it is a lookup, not a guess: region is one of the nine US Census",
  "divisions, state is a two-letter code, municipality is the snapshot's city name, peerGroup is an",
  "FAA hub size. Call describeMethodology when you are unsure which value a phrase maps to. Never",
  "invent an airport code to filter on.",
  "",
  "If you cannot resolve a place phrase to one of those values, do not geocode it, do not pick a",
  "nearby airport, and do not call queryAirports on a guess. Say the phrase did not resolve and name",
  `what this screen accepts: ${ACCEPTED_PLACE_PHRASES.join(", ")}. Say the same if queryAirports`,
  "comes back with unknownPlace or unknownIata.",
  "",
  "A compare is one call naming both codes: Los Angeles vs Santa Ana is queryAirports with iata",
  "['LAX', 'SNA']. Never answer a compare with a municipality or a metro: LAX and SNA are separate",
  "airports in different peer groups, this screen has no city market, and they stay two rows.",
  "",
  "A question about one number — long-haul share, delay minutes — is a single-metric lookup: call",
  "queryAirports with metric. That answer shows the one number and no composite and no candidate",
  "lamp, so do not call the airport a candidate on the strength of it.",
  "",
  "A follow-up that points at an earlier row (\"the second one\") is answered by calling",
  "queryAirports with that row's code, read off the ranking already in this conversation. The",
  "interface shows how the reference resolved; do not re-rank to find it again.",
  "",
  "The interface already renders the resolved airport set, the ranking table, each row's score vector",
  "and this answer's assumptions and gaps from the tool payload. Do not repeat the table as prose.",
  "A row's latitude and longitude are there to place the airport on the screen, not to be read out:",
  "never quote a coordinate, and never describe where an airport is from anything but its own row.",
  "Write at most three short paragraphs: what the resolved set is, which rows clear the",
  "strong-candidate band and why, and what a withheld composite means.",
  "",
  "Percentiles are within an airport's FAA hub-size peer group, computed nationally. A region",
  "question filters that national ranking; it never re-ranks a region against itself, and percentiles",
  "from two peer groups are not comparable. A missing input is absent data, never a low score, and an",
  "airport missing one has no composite.",
  "",
  "Construction cost, ROI, land, politics and airline leases are outside this screen. Call no tool for",
  "a question about them, estimate nothing, and answer with exactly this paragraph:",
  "",
  OFF_THESIS_REFUSAL,
].join("\n");

/** What the thread shows when the model itself failed: no numbers, no pretence. */
export const AGENT_ERROR_ANSWER =
  "The agent could not finish this answer. The question is saved — ask again, or open the tool rows " +
  "above to see how far it got. No ranking is shown because none was returned.";

/**
 * The answer to the newest question in `messages`. Prose and tool calls both
 * come back on one assistant message: the message list is the only record of an
 * answer, so a payload that is not stored here cannot be re-rendered later.
 * Every path returns a message the store will accept, so a thread never comes
 * back with a question and no reply under it.
 */
export async function answerQuestion(
  messages: readonly ThreadMessage[],
  run: AgentRunner = streamAgentModel,
): Promise<ThreadMessage> {
  try {
    const answer = await run({
      system: AGENT_SYSTEM_PROMPT,
      messages: messages.map((message) => ({ role: message.role, content: message.text })),
    });
    const text = answer.text.trim();
    // A turn with neither prose nor a payload draws nothing, and the store
    // refuses it — so it is the same silence a failed model leaves, and reads
    // as one.
    if (text.length === 0 && answer.toolCalls.length === 0) {
      return assistantMessage(AGENT_ERROR_ANSWER);
    }
    return assistantMessage(text, answer.toolCalls);
  } catch (error) {
    const failure = error instanceof NoProviderError ? NO_PROVIDER_ANSWER : AGENT_ERROR_ANSWER;
    return assistantMessage(failure);
  }
}
