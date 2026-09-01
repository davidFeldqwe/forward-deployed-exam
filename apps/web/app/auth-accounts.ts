import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { readSessionToken, type Session } from "./auth-token.ts";
import { getAccount, putAccount } from "./convex-store.ts";

/** Open signup: long enough to be a password, no composition theatre. */
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const SCRYPT_SALT_LENGTH = 16;
const SCRYPT_KEY_LENGTH = 32;

export type CredentialErrors = {
  email?: string;
  password?: string;
};

export type AccountResult =
  | { ok: true; email: string }
  | { ok: false; errors: CredentialErrors };

/**
 * The identity store seam. Convex holds accounts (PRD: Auth and Threads only).
 * Password hashes live in that document store, so a signed-in cookie still
 * maps to a live account after a process restart.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateCredentials(
  email: string,
  password: string,
): CredentialErrors {
  const errors: CredentialErrors = {};
  if (!EMAIL_PATTERN.test(normalizeEmail(email))) {
    errors.email = "Enter an email address like analyst@example.com.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return errors;
}

/** `scrypt$<salt>$<derived key>`, both hex. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, derivedHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !derivedHex) {
    return false;
  }
  const expected = Buffer.from(derivedHex, "hex");
  if (expected.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }
  const actual = scryptSync(
    password,
    Buffer.from(saltHex, "hex"),
    SCRYPT_KEY_LENGTH,
  );
  return timingSafeEqual(expected, actual);
}

export async function createAccount(email: string, password: string): Promise<AccountResult> {
  const errors = validateCredentials(email, password);
  if (errors.email || errors.password) {
    return { ok: false, errors };
  }

  const normalized = normalizeEmail(email);
  if (await getAccount(normalized)) {
    return {
      ok: false,
      errors: { email: "That email already has an account. Sign in instead." },
    };
  }

  await putAccount({ email: normalized, passwordHash: hashPassword(password) });
  return { ok: true, email: normalized };
}

/** Whether this email is an account the cookie can still map to. */
export async function accountExists(email: string): Promise<boolean> {
  return (await getAccount(normalizeEmail(email))) !== null;
}

/**
 * A session cookie is live only while the account it names still exists. A
 * restart that dropped in-process Maps used to leave a valid HMAC pointing at
 * nobody; Convex keeps the account, and this check refuses a cookie for one
 * that is gone.
 */
export async function sessionIfAccountLive(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<Session | null> {
  const session = readSessionToken(token, secret, now);
  return session && (await accountExists(session.email)) ? session : null;
}

/**
 * The hash of a password nobody holds. An unknown email is checked against it
 * so sign-in pays the same scrypt cost either way; without it the answer comes
 * back instantly and the clock enumerates accounts the message will not.
 */
const NO_ACCOUNT_HASH = hashPassword(randomBytes(32).toString("hex"));

export async function authenticate(email: string, password: string): Promise<AccountResult> {
  const normalized = normalizeEmail(email);
  const stored = (await getAccount(normalized))?.passwordHash;
  const matches = verifyPassword(password, stored ?? NO_ACCOUNT_HASH);
  // One message for both cases, so sign-in does not enumerate accounts.
  if (!stored || !matches) {
    return { ok: false, errors: { email: "Email or password is incorrect." } };
  }
  return { ok: true, email: normalized };
}
