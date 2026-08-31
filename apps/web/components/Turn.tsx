import type { ThreadRole } from "@/app/thread-messages";

/**
 * The chrome one turn is drawn in: who is speaking, and their words. The
 * pending row (story 35) draws a turn that is not in the message list yet, so
 * the label and the prose live here rather than in the transcript — a question
 * in flight is set like the same question once it has landed.
 */
const ROLE_LABELS: Readonly<Record<ThreadRole, string>> = {
  user: "You",
  assistant: "Agent",
};

export function RoleLabel({ role }: { role: ThreadRole }) {
  return (
    <span className="font-mono text-[11.5px] tracking-wide text-muted-foreground uppercase">
      {ROLE_LABELS[role]}
    </span>
  );
}

export function Prose({ text }: { text: string }) {
  return <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-body">{text}</p>;
}
