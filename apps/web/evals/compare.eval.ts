/**
 * Local Evalite case: compare congestion at Los Angeles and Santa Ana, through
 * the same `answerQuestion` / `streamAgentModel` loop chat uses.
 */
import { answerQuestion } from "../app/agent.ts";
import { streamAgentModel } from "../app/agent-model.ts";
import { chatCopy } from "../app/chat-copy.ts";
import { checkCompareCongestion, type CitationVerdict } from "../app/citation-check.ts";
import { userMessage, type ThreadMessage } from "../app/thread-messages.ts";

export const COMPARE_CONGESTION_QUESTION = chatCopy.chips[1];

export type CompareEvalResult = {
  question: string;
  answer: ThreadMessage;
  verdict: CitationVerdict;
};

export async function runCompareEval(): Promise<CompareEvalResult> {
  const answer = await answerQuestion(
    [userMessage(COMPARE_CONGESTION_QUESTION)],
    streamAgentModel,
  );
  return {
    question: COMPARE_CONGESTION_QUESTION,
    answer,
    verdict: checkCompareCongestion(answer),
  };
}
