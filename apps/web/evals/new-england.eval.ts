/**
 * Local Evalite case: the New England renovation-investment candidates
 * question, through the same `answerQuestion` / `streamAgentModel` loop chat
 * uses. Graded on the code/LLM boundary, not by a second model.
 */
import { answerQuestion } from "../app/agent.ts";
import { streamAgentModel } from "../app/agent-model.ts";
import { chatCopy } from "../app/chat-copy.ts";
import { checkNewEnglandRanking, type CitationVerdict } from "../app/citation-check.ts";
import { userMessage, type ThreadMessage } from "../app/thread-messages.ts";

export const NEW_ENGLAND_CANDIDATES_QUESTION = chatCopy.chips[0];

export type NewEnglandEvalResult = {
  question: string;
  answer: ThreadMessage;
  verdict: CitationVerdict;
};

export async function runNewEnglandEval(): Promise<NewEnglandEvalResult> {
  const answer = await answerQuestion(
    [userMessage(NEW_ENGLAND_CANDIDATES_QUESTION)],
    streamAgentModel,
  );
  return {
    question: NEW_ENGLAND_CANDIDATES_QUESTION,
    answer,
    verdict: checkNewEnglandRanking(answer),
  };
}
