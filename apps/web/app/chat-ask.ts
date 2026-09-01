"use client";

import {
  CHAT_SSE_PATH,
  carriedPrompt,
  chatPathWithPrompt,
  loginRedirect,
} from "@/app/auth-gate";
import { textField } from "@/app/form-fields";

/** Open or refresh the Thread that the SSE stream just finished writing. */
export type LandThread = (nextThreadId: string | null) => void;

/**
 * Composer submit: POST the same form to the chat SSE route and wait until the
 * stream ends. The pending row and held Send follow that in-flight wait.
 */
export async function askOnChatSse(formData: FormData, landThread: LandThread): Promise<void> {
  const question = carriedPrompt(textField(formData, "prompt"));
  if (!question) {
    return;
  }

  const response = await fetch(CHAT_SSE_PATH, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    redirect: "manual",
  });

  if (response.status === 204) {
    return;
  }

  if (isLoginRedirect(response)) {
    const loginAt = response.headers.get("Location") ?? loginRedirect(chatPathWithPrompt(question));
    window.location.assign(loginAt);
    return;
  }

  if (!response.ok || response.body === null) {
    window.location.assign(loginRedirect(chatPathWithPrompt(question)));
    return;
  }

  const threadId = await threadIdFromSse(response.body, textField(formData, "threadId") || null);
  landThread(threadId);
}

function isLoginRedirect(response: Response): boolean {
  return response.status === 303 || response.status === 401 || response.type === "opaqueredirect";
}

async function threadIdFromSse(
  body: ReadableStream<Uint8Array>,
  fallback: string | null,
): Promise<string | null> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  let threadId = fallback;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      threadId = threadIdInSseBlock(block) ?? threadId;
    }
  }

  return threadId;
}

function threadIdInSseBlock(block: string): string | null {
  const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) {
    return null;
  }
  const event: unknown = JSON.parse(dataLine.slice("data: ".length));
  if (typeof event !== "object" || event === null || !("threadId" in event)) {
    return null;
  }
  const threadId = event.threadId;
  return typeof threadId === "string" && threadId.length > 0 ? threadId : null;
}
