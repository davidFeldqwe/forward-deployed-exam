import { clientIpFromHeaders } from "@/app/agent-spend";
import { currentSession } from "@/app/auth-session";
import { chatSseResponse } from "@/app/chat-sse";

/**
 * Signed-in agent: persist the question, stream the loop, store one Thread
 * answer. Spend cap and one-in-flight-ask live on `askOnThread`, not here.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await currentSession();
  return chatSseResponse(request, {
    email: session?.email ?? null,
    clientIp: clientIpFromHeaders(request.headers),
  });
}
