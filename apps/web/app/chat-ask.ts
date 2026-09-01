"use client";

import {
  CHAT_SSE_PATH,
  carriedPrompt,
  chatPathWithPrompt,
  loginRedirect,
} from "@/app/auth-gate";
import { parseChatStreamEvent, type ChatStreamEvent } from "@/app/chat-stream";
import { textField } from "@/app/form-fields";

/** Open or refresh the Thread that the SSE stream just finished writing. */
export type LandThread = (nextThreadId: string | null) => void;

/** One parsed SSE event while the ask is in flight. */
export type OnChatStreamEvent = (event: ChatStreamEvent) => void;

/**
 * Composer submit: POST the same form to the chat SSE route and wait until the
 * stream ends. `text` and complete `tool` events are forwarded as they arrive
 * so the pending turn can grow; ranking numbers are not events.
 */
export async function askOnChatSse(
  formData: FormData,
  landThread: LandThread,
  onEvent: OnChatStreamEvent,
): Promise<void> {
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

  const threadId = await threadIdFromSse(
    response.body,
    textField(formData, "threadId") || null,
    onEvent,
  );
  landThread(threadId);
}

function isLoginRedirect(response: Response): boolean {
  return response.status === 303 || response.status === 401 || response.type === "opaqueredirect";
}

async function threadIdFromSse(
  body: ReadableStream<Uint8Array>,
  fallback: string | null,
  onEvent: OnChatStreamEvent,
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
      const event = eventInSseBlock(block);
      if (!event) {
        continue;
      }
      onEvent(event);
      if (event.type === "question" || event.type === "done") {
        threadId = event.threadId;
      }
    }
  }

  return threadId;
}

function eventInSseBlock(block: string): ChatStreamEvent | null {
  const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) {
    return null;
  }
  try {
    return parseChatStreamEvent(JSON.parse(dataLine.slice("data: ".length)));
  } catch {
    return null;
  }
}
