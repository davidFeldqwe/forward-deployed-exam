import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type AccountResult,
  type CredentialErrors,
  MIN_PASSWORD_LENGTH,
  authenticate,
  createAccount,
  hashPassword,
  normalizeEmail,
  validateCredentials,
  verifyPassword,
} from "./auth-accounts.ts";

/** Asserts the attempt was refused and hands back what it complained about. */
function refusedErrors(result: AccountResult): CredentialErrors {
  assert.equal(result.ok, false);
  return result.ok ? {} : result.errors;
}

test("signup is open: any well-formed email is accepted, with no invite list", () => {
  for (const email of [
    "analyst@example.com",
    "someone.else@sub.domain.co.uk",
    "reviewer+tag@example.org",
  ]) {
    assert.deepEqual(validateCredentials(email, "correct horse battery"), {});
  }
});

test("a malformed email is rejected on the email field only", () => {
  for (const email of ["", "  ", "analyst", "analyst@", "@example.com", "a b@example.com"]) {
    const errors = validateCredentials(email, "correct horse battery");
    assert.ok(errors.email, `should reject ${JSON.stringify(email)}`);
    assert.equal(errors.password, undefined);
  }
});

test("a short password is rejected on the password field only", () => {
  const errors = validateCredentials("analyst@example.com", "short");
  assert.ok(errors.password);
  assert.match(errors.password, new RegExp(String(MIN_PASSWORD_LENGTH)));
  assert.equal(errors.email, undefined);
});

test("email is normalized so case and stray spaces do not fork an account", () => {
  assert.equal(normalizeEmail("  Analyst@Example.COM "), "analyst@example.com");
});

test("a stored password is salted, never plaintext, and only verifies itself", () => {
  const password = "correct horse battery";
  const stored = hashPassword(password);

  assert.equal(stored.includes(password), false);
  assert.notEqual(stored, hashPassword(password));
  assert.equal(verifyPassword(password, stored), true);
  assert.equal(verifyPassword("wrong horse battery", stored), false);
  assert.equal(verifyPassword(password, "not-a-stored-hash"), false);
  assert.equal(verifyPassword(password, "scrypt$abcd$abcd"), false);
});

test("open signup creates an account and signs it in", () => {
  assert.deepEqual(createAccount("New@Example.com", "correct horse battery"), {
    ok: true,
    email: "new@example.com",
  });
  assert.deepEqual(authenticate("new@example.com", "correct horse battery"), {
    ok: true,
    email: "new@example.com",
  });
});

test("an email already in use is refused with a sign-in hint, not a duplicate account", () => {
  createAccount("taken@example.com", "correct horse battery");
  const errors = refusedErrors(createAccount("TAKEN@example.com", "another password"));

  assert.match(String(errors.email), /already/i);
  assert.deepEqual(authenticate("taken@example.com", "correct horse battery"), {
    ok: true,
    email: "taken@example.com",
  });
});

test("sign-in refuses a wrong password or an unknown email without saying which", () => {
  createAccount("returning@example.com", "correct horse battery");

  const wrongPassword = authenticate("returning@example.com", "guess password");
  const unknownEmail = authenticate("stranger@example.com", "correct horse battery");

  assert.equal(wrongPassword.ok, false);
  assert.deepEqual(wrongPassword, unknownEmail);
});

test("credential rules apply before an account is created", () => {
  const errors = refusedErrors(createAccount("not-an-email", "short"));

  assert.ok(errors.email);
  assert.ok(errors.password);
  assert.equal(authenticate("not-an-email", "short").ok, false);
});
