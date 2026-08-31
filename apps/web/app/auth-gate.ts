export const LOGIN_PATH = "/login";
export const CHAT_PATH = "/chat";

/** A carried question is a composer draft, not an essay. */
export const PROMPT_MAX_LENGTH = 400;

/** Where a signed-in analyst lands: their last Thread, or an empty one. */
export function chatDestination(lastThreadId: string | null): string {
  return lastThreadId ? `${CHAT_PATH}/${lastThreadId}` : CHAT_PATH;
}

/** A `/chat` path that carries a Landing question into a new Thread. */
export function chatPathWithPrompt(prompt: string): string {
  return `${CHAT_PATH}?prompt=${encodeURIComponent(prompt)}`;
}

/** Where a signed-out visitor goes when they ask for a gated path. */
export function loginRedirect(requestedPath: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(requestedPath)}`;
}

/**
 * Where login sends someone once they are in. Only our own chat paths are
 * honoured, so a crafted `next` cannot bounce them off-site.
 */
export function postLoginPath(next: string | string[] | undefined): string {
  if (typeof next !== "string" || !next.startsWith(CHAT_PATH)) {
    return CHAT_PATH;
  }
  const rest = next.slice(CHAT_PATH.length);
  if (rest.length > 0 && !rest.startsWith("/") && !rest.startsWith("?")) {
    return CHAT_PATH;
  }
  // `//host` and `/\host` are protocol-relative escapes, not chat paths.
  return rest.startsWith("//") || rest.startsWith("/\\") ? CHAT_PATH : next;
}

/** The question a chat path carries, if it carries a usable one. */
export function promptFromPath(path: string): string | null {
  const query = path.indexOf("?");
  if (query === -1) {
    return null;
  }
  const carried = new URLSearchParams(path.slice(query + 1)).get("prompt");
  return carriedPrompt(carried ?? undefined);
}

/** The question a gated request carried, if it carried a usable one. */
export function carriedPrompt(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const prompt = value.trim();
  return prompt.length === 0 ? null : prompt.slice(0, PROMPT_MAX_LENGTH);
}
