/**
 * Local Evalite case: ROI of a terminal at LAX — off-thesis, no tools, locked
 * refusal copy.
 */
import { answerQuestion } from "../app/agent.ts";
import { streamAgentModel } from "../app/agent-model.ts";
import { checkOffThesisRefusal, type CitationVerdict } from "../app/citation-check.ts";
import { userMessage, type ThreadMessage } from "../app/thread-messages.ts";

export const ROI_QUESTION = "What is the ROI of a terminal at LAX?";

export type RoiEvalResult = {
  question: string;
  answer: ThreadMessage;
  verdict: CitationVerdict;
};

export async function runRoiEval(): Promise<RoiEvalResult> {
  const answer = await answerQuestion([userMessage(ROI_QUESTION)], streamAgentModel);
  return {
    question: ROI_QUESTION,
    answer,
    verdict: checkOffThesisRefusal(answer),
  };
}
