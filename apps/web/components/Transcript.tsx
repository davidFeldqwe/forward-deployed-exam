import type { ThreadMessage, ToolCall } from "@/app/threads";

const roleLabel: Record<ThreadMessage["role"], string> = {
  user: "You",
  assistant: "Agent",
};

/**
 * The persisted message list. Answer objects (ranking, score vector, lamp) are
 * rendered from the tool payloads in #21; until then the payload is shown as
 * the inspectable row it was stored as, collapsed.
 */
export function Transcript({ messages }: { messages: readonly ThreadMessage[] }) {
  return (
    <ol className="flex list-none flex-col gap-6 p-0">
      {messages.map((message, index) => (
        <li key={index} className="flex flex-col gap-2">
          <span className="font-mono text-[11.5px] tracking-wide text-muted-foreground uppercase">
            {roleLabel[message.role]}
          </span>
          {message.text ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-body">
              {message.text}
            </p>
          ) : null}
          {message.toolCalls.map((call, callIndex) => (
            <ToolRow key={`${call.tool}-${callIndex}`} call={call} />
          ))}
        </li>
      ))}
    </ol>
  );
}

function ToolRow({ call }: { call: ToolCall }) {
  return (
    <details className="rounded-lg border bg-card px-3 py-2">
      <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
        {call.tool} · complete ({Math.round(call.durationMs)} ms)
      </summary>
      <pre className="mt-2 overflow-x-auto font-mono text-[11.5px] text-muted-foreground">
        {JSON.stringify({ args: call.args, result: call.result }, null, 2)}
      </pre>
    </details>
  );
}
