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

/** Median cost of an attempt, so one scheduling hiccup cannot decide a run. */
async function medianMillis(attempt: () => Promise<unknown>): Promise<number> {
  const samples = [];
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now();
    await attempt();
    samples.push(performance.now() - started);
  }
  return samples.sort((a, b) => a - b)[2]!;
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

test("open signup creates an account and signs it in", async () => {
  assert.deepEqual(await createAccount("New@Example.com", "correct horse battery"), {
    ok: true,
    email: "new@example.com",
  });
  assert.deepEqual(await authenticate("new@example.com", "correct horse battery"), {
    ok: true,
    email: "new@example.com",
  });
});

test("an email already in use is refused with a sign-in hint, not a duplicate account", async () => {
  await createAccount("taken@example.com", "correct horse battery");
  const errors = refusedErrors(await createAccount("TAKEN@example.com", "another password"));

  assert.match(String(errors.email), /already/i);
  assert.deepEqual(await authenticate("taken@example.com", "correct horse battery"), {
    ok: true,
    email: "taken@example.com",
  });
});

test("sign-in refuses a wrong password or an unknown email without saying which", async () => {
  await createAccount("returning@example.com", "correct horse battery");

  const wrongPassword = await authenticate("returning@example.com", "guess password");
  const unknownEmail = await authenticate("stranger@example.com", "correct horse battery");

  assert.equal(wrongPassword.ok, false);
  assert.deepEqual(wrongPassword, unknownEmail);
});

test("an unknown email costs the same password work as a wrong password, so timing cannot enumerate", async () => {
  await createAccount("timed@example.com", "correct horse battery");

  const wrongPassword = await medianMillis(() =>
    authenticate("timed@example.com", "guess password"),
  );
  const unknownEmail = await medianMillis(() =>
    authenticate("nobody@example.com", "guess password"),
  );

  assert.ok(
    unknownEmail > wrongPassword / 2,
    `an unknown email answered in ${unknownEmail}ms against ${wrongPassword}ms for a wrong password`,
  );
});

test("credential rules apply before an account is created", async () => {
  const errors = refusedErrors(await createAccount("not-an-email", "short"));

  assert.ok(errors.email);
  assert.ok(errors.password);
  assert.equal((await authenticate("not-an-email", "short")).ok, false);
});
