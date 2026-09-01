import { chatDestination } from "./auth-gate.ts";

/**
 * After SSE finishes, stay on the open Thread with a payload refresh. A new
 * Thread from empty chat is a client navigation, not a document assign.
 */
export function afterSuccessfulAsk(
  openedThreadId: string | null,
  nextThreadId: string | null,
): { kind: "refresh" } | { kind: "open"; href: string } {
  const href = chatDestination(nextThreadId);
  if (openedThreadId !== null && chatDestination(openedThreadId) === href) {
    return { kind: "refresh" };
  }
  return { kind: "open", href };
}
