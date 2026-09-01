/**
 * Signed-in chat as a `POST` SSE route (PRD HTTP, issue #65). The composer
 * stores the question first, streams while the model runs, and writes one
 * assistant Thread answer when the loop ends. Ranking numbers are not events:
 * they re-render from the stored `queryAirports` payload.
 */
import { answerQuestion, type AgentRunner } from "./agent.ts";
import { streamAgentModel, type AgentStreamEvent } from "./agent-model.ts";
import {
  carriedPrompt,
  chatPathWithPrompt,
  CHAT_PATH,
  loginRedirect,
} from "./auth-gate.ts";
import { textField } from "./form-fields.ts";
import { askOnThread } from "./thread-store.ts";

export { CHAT_SSE_PATH } from "./auth-gate.ts";

export type ChatSseEvent =
  | { type: "question"; threadId: string }
  | AgentStreamEvent
  | { type: "done"; threadId: string };

export type ChatSseAsk = {
  email: string | null;
  clientIp: string;
  /** Milliseconds since epoch; omitted means now, the same clock `askOnThread` takes. */
  at?: number;
  run?: AgentRunner;
};

export async function chatSseResponse(request: Request, ask: ChatSseAsk): Promise<Response> {
  const { question, threadId } = await readAsk(request);
  const email = ask.email;

  if (!email) {
    const next = question ? chatPathWithPrompt(question) : CHAT_PATH;
    return new Response(null, { status: 303, headers: { Location: loginRedirect(next) } });
  }

  if (!question) {
    return new Response(null, { status: 204 });
  }

  const run = ask.run ?? streamAgentModel;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatSseEvent) => {
        controller.enqueue(encoder.encode(formatSse(event)));
      };
      try {
        const thread = await askOnThread(
          email,
          threadId,
          question,
          async (open) => {
            send({ type: "question", threadId: open.id });
            return answerQuestion(open.messages, (request) => run(request, send));
          },
          ask.clientIp,
          ask.at,
        );
        if (thread) {
          send({ type: "done", threadId: thread.id });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

async function readAsk(request: Request): Promise<{ question: string | null; threadId: string | null }> {
  const form = await request.formData();
  return {
    question: carriedPrompt(textField(form, "prompt")),
    threadId: textField(form, "threadId") || null,
  };
}

function formatSse(event: ChatSseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
