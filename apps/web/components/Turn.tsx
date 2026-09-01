import type { ThreadRole } from "@/app/thread-messages";

/**
 * The chrome one turn is drawn in: who is speaking, and their words. The
 * pending row (story 35) draws a turn that is not in the message list yet, so
 * the label and the prose live here rather than in the transcript — a question
 * in flight is set like the same question once it has landed. User words sit in
 * a right-aligned muted pill (`UserTurn`); agent words stay left and full width.
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

/**
 * The analyst's question: one chrome for a landed turn and for the same
 * question still in flight, so Send does not change the shape of what is
 * already on screen.
 */
export function UserTurn({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-end gap-3">
      <RoleLabel role="user" />
      <div className="w-fit max-w-full min-w-0 break-words rounded-2xl bg-raised px-3.5 py-2">
        <Prose text={text} />
      </div>
    </div>
  );
}
