import { completePrompt } from "@/app/agent-model";
import {
  autocompleteContinuation,
  completionRequest,
  isMockLlm,
} from "@/app/autocomplete";
import { currentSession } from "@/app/auth-session";

/**
 * Composer ghost: JSON in, a suggestion or null out. Not the streaming chat
 * path — a failure here is silence in the draft, not a Thread message.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await currentSession();
  if (!session) {
    return Response.json({ suggestion: null }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ suggestion: null });
  }

  const suggestion = await autocompleteContinuation(body, {
    mock: isMockLlm(process.env),
    complete: (pack) => completePrompt(completionRequest(pack)),
  });
  return Response.json({ suggestion });
}
