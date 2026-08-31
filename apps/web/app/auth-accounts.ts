import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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
 * The identity store seam. Convex Auth owns accounts once a deployment exists
 * (PRD: Convex stores auth and Threads only); until then this process holds
 * them, so accounts do not survive a server restart.
 */
const passwordHashByEmail = new Map<string, string>();

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

export function createAccount(email: string, password: string): AccountResult {
  const errors = validateCredentials(email, password);
  if (errors.email || errors.password) {
    return { ok: false, errors };
  }

  const normalized = normalizeEmail(email);
  if (passwordHashByEmail.has(normalized)) {
    return {
      ok: false,
      errors: { email: "That email already has an account. Sign in instead." },
    };
  }

  passwordHashByEmail.set(normalized, hashPassword(password));
  return { ok: true, email: normalized };
}

export function authenticate(email: string, password: string): AccountResult {
  const normalized = normalizeEmail(email);
  const stored = passwordHashByEmail.get(normalized);
  // One message for both cases, so sign-in does not enumerate accounts.
  if (!stored || !verifyPassword(password, stored)) {
    return { ok: false, errors: { email: "Email or password is incorrect." } };
  }
  return { ok: true, email: normalized };
}
