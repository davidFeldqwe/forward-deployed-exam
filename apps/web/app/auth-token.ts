import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Session = {
  email: string;
};

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSessionToken(
  email: string,
  secret: string,
  now: number = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ email, expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Session | null {
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length > 0) {
    return null;
  }

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  const claims = parseClaims(payload);
  return claims && claims.expiresAt > now ? { email: claims.email } : null;
}

function parseClaims(
  payload: string,
): { email: string; expiresAt: number } | null {
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      typeof claims === "object" &&
      claims !== null &&
      "email" in claims &&
      "expiresAt" in claims &&
      typeof claims.email === "string" &&
      typeof claims.expiresAt === "number"
    ) {
      return { email: claims.email, expiresAt: claims.expiresAt };
    }
    return null;
  } catch {
    return null;
  }
}
