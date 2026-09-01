"use client";

import {
  CHAT_SSE_PATH,
  carriedPrompt,
  chatDestination,
  chatPathWithPrompt,
  loginRedirect,
} from "@/app/auth-gate";
import { textField } from "@/app/form-fields";

/**
 * Composer submit: POST the same form to the chat SSE route and wait until the
 * stream ends. `useFormStatus` is pending for that whole wait — the pending row
 * and held Send have no second signal.
 */
export async function askOnChatSse(formData: FormData): Promise<void> {
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

  const loginAt = response.headers.get("Location") ?? loginRedirect(chatPathWithPrompt(question));
  if (response.status === 303 || response.status === 401 || response.type === "opaqueredirect") {
    window.location.assign(loginAt);
    return;
  }

  if (!response.ok || response.body === null) {
    window.location.assign(loginRedirect(chatPathWithPrompt(question)));
    return;
  }

  let threadId = textField(formData, "threadId") || null;
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) {
        continue;
      }
      const event = JSON.parse(dataLine.slice("data: ".length)) as { threadId?: unknown };
      if (typeof event.threadId === "string" && event.threadId.length > 0) {
        threadId = event.threadId;
      }
    }
  }

  window.location.assign(chatDestination(threadId));
}
