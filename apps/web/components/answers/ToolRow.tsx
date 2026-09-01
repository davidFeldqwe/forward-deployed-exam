import type { JsonObject, JsonValue, ToolCall } from "@/app/thread-messages";

/**
 * One inspectable tool row (PRD story 33): the arguments the model chose and
 * the payload the screen returned. Collapsed by default as part of the turn's
 * Show more, so opening that control is what reveals name, duration, and the
 * arguments/result panes.
 */
export function ToolRow({ call }: { call: ToolCall }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span className="font-mono text-[12.5px] text-body">{call.tool}</span>
        <span className="text-xs text-muted-foreground/70">·</span>
        <span className="text-xs text-muted-foreground">Complete</span>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-muted-foreground/70">
          {Math.round(call.durationMs)} ms
        </span>
      </div>
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
    </div>
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
    .map(([key, value]): [string, string] => [key, argumentText(value)]);
  return lines.length === 0 ? [["(no arguments)", ""]] : lines;
}

/** A code list stays JSON; a place phrase is shown as the model wrote it. */
function argumentText(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
