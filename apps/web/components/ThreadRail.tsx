"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { chatCopy } from "@/app/chat-copy";
import { threadRail, type RailDestination } from "@/app/thread-rail";
import type { ThreadSummary } from "@/app/thread-store";
import { cn } from "@/lib/utils";

/**
 * A rail row: dense, one line, and instant. The press scale is the only
 * movement — opening a thread is a navigation, and a control reached this often
 * should not make the analyst wait for a transition to finish before the next
 * one is readable. `data-thread-row` carries the hover paint, which
 * `globals.css` gates to a fine pointer so a tap does not leave a row lit.
 */
const rowClass =
  "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground/70 no-underline transition-[transform,background-color,color] duration-[120ms] ease-[var(--ease-out)] active:scale-[0.97]";

const currentRowClass = "bg-sidebar-accent text-sidebar-accent-foreground";

/**
 * Recents as a persistent left column (issue #32; PRD story 17): the analyst's
 * threads by first question, and New thread above them. On a narrow viewport
 * the same rail is a drawer the header control opens.
 */
export function ThreadRail({
  threads,
  openThreadId,
  open,
  onNavigate,
}: {
  threads: readonly ThreadSummary[];
  openThreadId: string | null;
  /** Whether the narrow-viewport drawer is showing. Ignored from `md` up. */
  open: boolean;
  /** Closes the drawer once a destination has been picked. */
  onNavigate: () => void;
}) {
  const { newThread, rows } = threadRail(threads, openThreadId);

  return (
    <aside
      id="thread-rail"
      className={cn(
        // Flush under the header, near-black, with a thin edge against the
        // transcript column beside it.
        "z-20 flex w-60 shrink-0 flex-col border-e border-sidebar-border bg-sidebar",
        // Under `md` the rail is a drawer over the transcript. The slide is
        // short and eases out; reduced motion keeps the fade and drops the
        // movement. A closed drawer is `invisible`, so its links leave the
        // accessibility tree too — and only under `md`, where the rail is a
        // column a screen reader should always reach.
        "max-md:fixed max-md:top-12 max-md:bottom-0 max-md:start-0",
        "max-md:transition-[transform,opacity,visibility] max-md:duration-200",
        "max-md:ease-[var(--ease-drawer)] motion-reduce:max-md:transition-[opacity,visibility]",
        open
          ? "max-md:translate-x-0 max-md:opacity-100"
          : "max-md:invisible max-md:-translate-x-full max-md:opacity-0",
      )}
    >
      <div className="p-2">
        <RailLink destination={newThread} onNavigate={onNavigate}>
          <PlusIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {chatCopy.newThreadLabel}
        </RailLink>
      </div>

      <h2
        id="thread-rail-heading"
        className="px-4 pb-1 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
      >
        {chatCopy.recentsLabel}
      </h2>

      {/* Recents grows with the analyst's threads, so the list scrolls inside
          the rail rather than pushing New thread off the top of it. */}
      <nav
        aria-labelledby="thread-rail-heading"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        {rows.length === 0 ? (
          <p className="px-2 py-1 text-[12.5px] text-muted-foreground">
            {chatCopy.noRecentsLabel}
          </p>
        ) : (
          <ul className="flex list-none flex-col p-0">
            {rows.map((row) => (
              <li key={row.id}>
                <RailLink destination={row} onNavigate={onNavigate}>
                  <span className="truncate">{row.title}</span>
                </RailLink>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}

/**
 * One rail destination, drawn the same whether it is New thread or a recents
 * row: where it goes, whether the analyst is already there, and the drawer
 * closing behind the pick on a narrow viewport.
 */
function RailLink({
  destination,
  onNavigate,
  children,
}: {
  destination: RailDestination;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={destination.href}
      data-thread-row
      aria-current={destination.current ? "page" : undefined}
      onClick={onNavigate}
      className={cn(rowClass, destination.current && currentRowClass)}
    >
      {children}
    </Link>
  );
}
