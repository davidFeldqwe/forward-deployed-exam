import type { JsonObject, JsonValue, ToolCall } from "@/app/thread-messages";

/**
 * One inspectable tool row (PRD story 33), collapsed by default: the arguments
 * the model chose and the payload the screen returned, so a reviewer can check
 * the prose against the call rather than trusting it.
 */
export function ToolRow({ call }: { call: ToolCall }) {
  return (
    <details className="group overflow-hidden rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-[10px] text-muted-foreground/70">
          <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span>
        </span>
        <span className="font-mono text-[12.5px] text-body">{call.tool}</span>
        <span className="text-xs text-muted-foreground/70">·</span>
        <span className="text-xs text-muted-foreground">Complete</span>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-muted-foreground/70">
          {Math.round(call.durationMs)} ms
        </span>
      </summary>
      <div className="grid gap-5 border-t bg-background px-3 py-3 md:grid-cols-2">
        <Pane label="Arguments">
          {argumentLines(call.args).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4 border-b border-grid py-1">
              <span className="font-mono text-xs text-muted-foreground">{key}</span>
              <span className="text-right font-mono text-xs text-body">{value}</span>
            </div>
          ))}
        </Pane>
        <Pane label="Result">
          <pre className="max-h-64 overflow-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
            {JSON.stringify(call.result, null, 2)}
          </pre>
        </Pane>
      </div>
    </details>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground/70 uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

/** The call as it was made: a filter nobody supplied is not shown as `null`. */
function argumentLines(args: JsonObject): [string, string][] {
  const lines = Object.entries(args)
    .filter(([, value]) => value !== null)
    .map(([key, value]): [string, string] => [key, scalar(value)]);
  return lines.length === 0 ? [["(no arguments)", ""]] : lines;
}

function scalar(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
