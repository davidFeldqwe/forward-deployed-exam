import { clip } from "./text.ts";

/** The public home. Signed-out visitors land here; `/login` must be able to reach it. */
export const LANDING_PATH = "/";
export const LOGIN_PATH = "/login";
export const CHAT_PATH = "/chat";
/** Authenticated `POST` for the signed-in agent: SSE, not a document. */
export const CHAT_SSE_PATH = "/api/chat";
/**
 * The public capacity-pressure skyline (issue #69): the one surface in this
 * list that needs no session. Nothing below sends a visitor to login for it,
 * and `postLoginPath` still honours chat paths only.
 */
export const MAP_PATH = "/map";

/** A carried question is a composer draft, not an essay. */
export const PROMPT_MAX_LENGTH = 400;

/** A query value as a request hands it over: absent, single, or repeated. */
type QueryValue = string | string[] | null | undefined;

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
export function postLoginPath(next: QueryValue): string {
  return typeof next === "string" && isChatPath(next) ? next : CHAT_PATH;
}

/**
 * Printable ASCII with no spaces. Our own chat links are percent-encoded, so a
 * `next` outside this set is smuggling — a newline in a redirect target would
 * otherwise reach the `Location` header.
 */
const URL_PATH_CHARACTERS = /^[\x21-\x7e]+$/;

/** `/chat`, `/chat/<thread id>`, or `/chat?<query>`, and nothing else. */
function isChatPath(path: string): boolean {
  if (!URL_PATH_CHARACTERS.test(path) || !path.startsWith(CHAT_PATH)) {
    return false;
  }
  const rest = path.slice(CHAT_PATH.length);
  if (rest.length === 0) {
    return true;
  }
  // `//host` and `/\host` are protocol-relative escapes, not chat paths.
  if (rest.startsWith("//") || rest.startsWith("/\\")) {
    return false;
  }
  return rest.startsWith("/") || rest.startsWith("?");
}

/** The question a chat path carries, if it carries a usable one. */
export function promptFromPath(path: string): string | null {
  const query = path.indexOf("?");
  if (query === -1) {
    return null;
  }
  return carriedPrompt(new URLSearchParams(path.slice(query + 1)).get("prompt"));
}

/** The question a gated request carried, if it carried a usable one. */
export function carriedPrompt(value: QueryValue): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const prompt = value.trim();
  return prompt.length === 0 ? null : clip(prompt, PROMPT_MAX_LENGTH);
}
