import assert from "node:assert/strict";
import { test } from "node:test";

import { SESSION_MAX_AGE_SECONDS, readSessionToken, signSessionToken } from "./auth-token.ts";

const secret = "test-secret";
const now = 1_767_225_600_000;

test("a signed token round-trips the account it was issued for", () => {
  const token = signSessionToken("analyst@example.com", secret, now);
  assert.deepEqual(readSessionToken(token, secret, now), {
    email: "analyst@example.com",
  });
});

test("a tampered payload is rejected rather than trusted", () => {
  const token = signSessionToken("analyst@example.com", secret, now);
  const [payload, signature] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ email: "admin@example.com", expiresAt: now + 1000 }),
  ).toString("base64url");

  assert.equal(readSessionToken(`${forged}.${signature}`, secret, now), null);
  assert.equal(readSessionToken(`${payload}.deadbeef`, secret, now), null);
  assert.equal(readSessionToken(token, "other-secret", now), null);
});

test("an expired token is rejected", () => {
  const token = signSessionToken("analyst@example.com", secret, now);
  const afterExpiry = now + SESSION_MAX_AGE_SECONDS * 1000 + 1;

  assert.equal(readSessionToken(token, secret, afterExpiry), null);
});

test("a malformed token is rejected without throwing", () => {
  for (const malformed of ["", "no-dot", "a.b.c", "..", "%%%.%%%"]) {
    assert.equal(readSessionToken(malformed, secret, now), null, malformed);
  }
});
