/**
 * Local Evalite case: rank airports in Paris — must not geocode. Either a
 * no-tool accepted-phrase refusal or `unknownPlace` plus the locked copy.
 */
import { answerQuestion } from "../app/agent.ts";
import { streamAgentModel } from "../app/agent-model.ts";
import { checkParisRefusal, type CitationVerdict } from "../app/citation-check.ts";
import { userMessage, type ThreadMessage } from "../app/thread-messages.ts";

export const PARIS_QUESTION = "Rank airports in Paris.";

export type ParisEvalResult = {
  question: string;
  answer: ThreadMessage;
  verdict: CitationVerdict;
};

export async function runParisEval(): Promise<ParisEvalResult> {
  const answer = await answerQuestion([userMessage(PARIS_QUESTION)], streamAgentModel);
  return {
    question: PARIS_QUESTION,
    answer,
    verdict: checkParisRefusal(answer),
  };
}
