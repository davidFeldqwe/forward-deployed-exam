/**
 * Client-side SSE for the in-flight ask. The route's event union lives next to
 * the vendor stream; this module names the same shapes without importing that
 * edge, so the composer can apply deltas without pulling an SDK into the bundle.
 *
 * Ranking numbers are not events. A `tool` event is a finished payload or it is
 * dropped; `text` only grows prose.
 */
import { parseToolCall, type ToolCall } from "./thread-messages.ts";

export type ChatStreamState = {
  threadId: string | null;
  text: string;
  toolCalls: readonly ToolCall[];
};

export const EMPTY_CHAT_STREAM: ChatStreamState = {
  threadId: null,
  text: "",
  toolCalls: [],
};

export type ChatStreamEvent =
  | { type: "question"; threadId: string }
  | { type: "done"; threadId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; call: ToolCall };

/** One `data:` JSON payload, or null when it is not a usable chat event. */
export function parseChatStreamEvent(value: unknown): ChatStreamEvent | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const event = value as Record<string, unknown>;
  if (event.type === "question" || event.type === "done") {
    return typeof event.threadId === "string" && event.threadId.length > 0
      ? { type: event.type, threadId: event.threadId }
      : null;
  }
  if (event.type === "text") {
    return typeof event.delta === "string" && event.delta.length > 0
      ? { type: "text", delta: event.delta }
      : null;
  }
  if (event.type === "tool") {
    const call = parseToolCall(event.call);
    return call ? { type: "tool", call } : null;
  }
  return null;
}

export function applyChatStreamEvent(
  state: ChatStreamState,
  event: ChatStreamEvent,
): ChatStreamState {
  switch (event.type) {
    case "question":
    case "done":
      return { ...state, threadId: event.threadId };
    case "text":
      return { ...state, text: state.text + event.delta };
    case "tool":
      return { ...state, toolCalls: [...state.toolCalls, event.call] };
  }
}
