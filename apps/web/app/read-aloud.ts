/**
 * Read aloud (issue #28; PRD stories 36-37): the analyst can have the thread's
 * last assistant **prose** spoken by the browser's own speech API. Nothing else
 * is spoken. The ranking table, the resolved airport set, the score vector and
 * the caveats are rendered from tool payloads, and they stay in the DOM where a
 * screen reader can walk them at the reader's own pace — a narrated composite is
 * a number with no column heading, no peer group and no coverage state beside
 * it.
 *
 * One control, on the last answer that wrote prose. The issue's title is "read
 * aloud last assistant prose": a thread with six answers would otherwise offer
 * six play buttons, and "which one is talking" becomes a question the screen has
 * to answer. An earlier answer keeps its prose on the page; it does not keep a
 * control.
 */
import type { ThreadMessage } from "./thread-messages.ts";

export const readAloud = {
  label: "Read aloud",
  /** While the browser is speaking: the same control stops it. */
  stopLabel: "Stop",
  note: "Browser speech, this prose only — the table and the score vector are not read out.",
} as const;

/**
 * The prose the control on the turn at `index` speaks, or null when that turn
 * gets no control: it is the analyst's own message, it is an answer that wrote
 * no sentence, or a later answer wrote one.
 */
export function spokenProse(messages: readonly ThreadMessage[], index: number): string | null {
  const message = messages[index];
  if (!message || index !== lastProseTurn(messages)) {
    return null;
  }
  return message.text.trim();
}

/** The last assistant turn that wrote something to say, or -1 if none did. */
function lastProseTurn(messages: readonly ThreadMessage[]): number {
  for (let at = messages.length - 1; at >= 0; at -= 1) {
    const message = messages[at];
    if (message?.role === "assistant" && message.text.trim().length > 0) {
      return at;
    }
  }
  return -1;
}
