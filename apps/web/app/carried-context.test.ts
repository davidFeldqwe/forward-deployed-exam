import assert from "node:assert/strict";
import { test } from "node:test";

import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { carriedContext } from "./carried-context.ts";
import {
  assistantMessage,
  userMessage,
  type ThreadMessage,
  type ToolCall,
} from "./thread-messages.ts";

function call(args: Record<string, string | string[]>): ToolCall {
  return {
    tool: "queryAirports",
    args,
    result: toolPayloadJson(runAgentTool("queryAirports", args)),
    durationMs: 8,
  };
}

// The New England answer this thread's follow-ups are carried from: PVD, BDL,
// PWM, BOS, in that ranked order.
const newEngland = call({ region: "New England" });

function thread(question: string, followUp: ToolCall): ThreadMessage[] {
  return [
    userMessage("Which airports in New England are renovation-investment candidates?"),
    assistantMessage("PVD leads the set.", [newEngland]),
    userMessage(question),
    assistantMessage("Bradley's delay percentile is the reason.", [followUp]),
  ];
}

test("“the second one” is resolved against the ranking earlier in this thread", () => {
  const messages = thread("Tell me more about the second one.", call({ iata: "BDL" }));
  const carried = carriedContext(messages, 3);

  assert.equal(carried?.phrase, "the second one");
  assert.equal(carried?.from, "New England");
  assert.deepEqual(carried?.airports, [
    { iata: "BDL", name: "Bradley International Airport", rank: 2 },
  ]);
  // The block says how the reference was resolved, not that it was guessed.
  assert.match(carried?.summary ?? "", /row 2/);
  assert.match(carried?.summary ?? "", /New England/);
});

test("a pronoun carries the whole earlier set when the follow-up keeps it", () => {
  const carried = carriedContext(
    thread("How much delay do they have?", call({ iata: ["PVD", "BDL"] })),
    3,
  );

  assert.equal(carried?.phrase, "they");
  assert.deepEqual(
    carried?.airports.map(({ iata, rank }) => ({ iata, rank })),
    [
      { iata: "PVD", rank: 1 },
      { iata: "BDL", rank: 2 },
    ],
  );
});

test("a question that names the airport itself carried nothing", () => {
  // The code is in the question, so the thread resolved no reference: showing a
  // carried-context block here would claim a resolution that did not happen.
  assert.equal(carriedContext(thread("What is delay at BDL?", call({ iata: "BDL" })), 3), null);
  // The municipality names it too, even though the tool was called with a code.
  assert.equal(
    carriedContext(
      thread("And the second one — how is Hartford doing?", call({ iata: "BDL" })),
      3,
    ),
    null,
  );
});

test("a new place phrase is a new ranking, not a carried reference", () => {
  const messages = thread("What about the Pacific division?", call({ region: "Pacific" }));

  assert.equal(carriedContext(messages, 3), null);
});

test("a first answer has nothing to carry, and neither does an untraceable code", () => {
  const first: ThreadMessage[] = [
    userMessage("How is the second one doing?"),
    assistantMessage("Here is Santa Ana.", [call({ iata: "SNA" })]),
  ];
  assert.equal(carriedContext(first, 1), null);

  // SNA was never in this thread's resolved sets, so the reference was not
  // resolved from the message list and the block would be inventing a source.
  const untraceable = thread("How is the second one doing?", call({ iata: "SNA" }));
  assert.equal(carriedContext(untraceable, 3), null);
});

test("only an answer carries context, and only from an earlier answer", () => {
  const messages = thread("Tell me more about the second one.", call({ iata: "BDL" }));

  assert.equal(carriedContext(messages, 0), null, "a question is not an answer");
  assert.equal(carriedContext(messages, 1), null, "the first ranking carries nothing");
  assert.equal(carriedContext(messages, 9), null, "there is no message there");
});
