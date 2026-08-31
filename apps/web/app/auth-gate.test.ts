import assert from "node:assert/strict";
import { test } from "node:test";

import {
  carriedPrompt,
  chatDestination,
  chatPathWithPrompt,
  loginRedirect,
  postLoginPath,
  promptFromPath,
} from "./auth-gate.ts";
import { landingCopy } from "./landing-copy.ts";

test("an unauthenticated chat request is sent to login carrying where it wanted to go", () => {
  assert.equal(loginRedirect("/chat"), "/login?next=%2Fchat");
});

test("a Landing question card carries its prompt through login into a new thread", () => {
  const question = "Which airports in New England are renovation-investment candidates?";
  const gated = loginRedirect(chatPathWithPrompt(question));

  const next = new URL(gated, "https://example.test").searchParams.get("next");
  const landed = postLoginPath(next);
  const prompt = new URL(landed, "https://example.test").searchParams.get("prompt");

  assert.equal(landed.startsWith("/chat"), true);
  assert.equal(carriedPrompt(prompt), question);
});

test("a signed-in analyst lands on their last thread, or an empty chat when they have none", () => {
  assert.equal(chatDestination("k57bqp2c"), "/chat/k57bqp2c");
  assert.equal(chatDestination(null), "/chat");
});

test("post-login destination refuses anything but our own chat paths", () => {
  for (const hostile of [
    "https://evil.test/chat",
    "//evil.test/chat",
    "/\\evil.test",
    "/login",
    "/chatter",
    undefined,
    ["/chat", "/login"],
  ]) {
    assert.equal(postLoginPath(hostile), "/chat", `should refuse ${String(hostile)}`);
  }
  assert.equal(postLoginPath("/chat?prompt=x"), "/chat?prompt=x");
  assert.equal(postLoginPath("/chat/k57bqp2c"), "/chat/k57bqp2c");
});

test("a carried prompt is trimmed, bounded, and absent when blank", () => {
  assert.equal(carriedPrompt("  What is long-haul share out of Anchorage?  "),
    "What is long-haul share out of Anchorage?");
  assert.equal(carriedPrompt("   "), null);
  assert.equal(carriedPrompt(undefined), null);
  assert.equal(carriedPrompt(["a", "b"]), null);
  assert.equal(carriedPrompt("x".repeat(5000))?.length, 400);
});

test("every Landing suggested question survives the gate unchanged", () => {
  for (const question of landingCopy.suggestedQuestions) {
    const gated = loginRedirect(chatPathWithPrompt(question));
    const next = new URL(gated, "https://example.test").searchParams.get("next");

    assert.equal(promptFromPath(postLoginPath(next)), question);
  }
});

test("post-login destination refuses a next that smuggles control characters", () => {
  for (const hostile of [
    "/chat?prompt=x\r\nSet-Cookie: session=stolen",
    "/chat\nSet-Cookie: session=stolen",
    "/chat/thread ",
    "/chat ?prompt=x",
  ]) {
    assert.equal(
      postLoginPath(hostile),
      "/chat",
      `should refuse ${JSON.stringify(hostile)}`,
    );
  }
});

test("a chat path with no question carries none", () => {
  assert.equal(promptFromPath("/chat"), null);
  assert.equal(promptFromPath("/chat?prompt="), null);
  assert.equal(promptFromPath("/chat?other=x"), null);
  assert.equal(promptFromPath("/chat/k57bqp2c"), null);
});
