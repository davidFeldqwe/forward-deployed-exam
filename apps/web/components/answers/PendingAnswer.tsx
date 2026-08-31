"use client";

import { useFormStatus } from "react-dom";

import { pendingAnswer } from "@/app/pending-answer";
import { HeadCell } from "@/components/answers/HeadCell";
import { Prose, RoleLabel } from "@/components/Turn";

/**
 * The question on its way, and the pending row under it (PRD story 35). It is
 * drawn only while the composer's form is in flight, and it draws no number:
 * the composite and the candidate lamp cells stay empty until the tool payload
 * lands, so a reader never sees half a composite.
 */
export function PendingAnswer({ question }: { question: string }) {
  const { pending } = useFormStatus();
  if (!pending) {
    return null;
  }
  const asked = question.trim();

  return (
    <div className="flex flex-col gap-6 pt-6">
      {asked.length > 0 ? (
        <div className="flex flex-col gap-3">
          <RoleLabel role="user" />
          <Prose text={asked} />
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <RoleLabel role="assistant" />
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className={`${GRID} border-b bg-row-head px-3.5 py-2.5`}>
            <HeadCell>#</HeadCell>
            <HeadCell>Airport</HeadCell>
            <HeadCell className="text-right">Composite</HeadCell>
            <HeadCell>Candidate lamp</HeadCell>
          </div>
          {/* The row exists; its scores do not. Both number cells are left
              empty rather than filled with a placeholder that reads as one. */}
          <div className={`${GRID} border-b border-grid px-3.5 py-3`}>
            <span className="font-mono text-xs text-muted-foreground/70" aria-hidden>
              ·
            </span>
            <span className="text-[13.5px] text-muted-foreground">
              {pendingAnswer.airportLabel}
            </span>
            <span />
            <span className="justify-self-start rounded border border-border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">
              {pendingAnswer.rowLabel}
            </span>
          </div>
          <p className="m-0 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
            {pendingAnswer.label} {pendingAnswer.note}
          </p>
        </section>
      </div>
    </div>
  );
}

const GRID = "grid grid-cols-[26px_1fr_74px_150px] items-center gap-3";
