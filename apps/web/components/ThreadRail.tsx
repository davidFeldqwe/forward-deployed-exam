"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { PanelLeftIcon, PlusIcon } from "lucide-react";

import { chatCopy } from "@/app/chat-copy";
import {
  DRAWER_TOGGLE_ID,
  recentsDrawerKey,
  threadRail,
  type RailDestination,
} from "@/app/thread-rail";
import type { ThreadSummary } from "@/app/thread-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared by the rail and the header controls that point `aria-controls` at it. */
const RAIL_ID = "thread-rail";

/**
 * The rail as its own column: flush under the header, near-black, with a thin
 * edge against the transcript column beside it.
 */
const railClass = "z-20 flex w-60 shrink-0 flex-col border-e border-sidebar-border bg-sidebar";

/**
 * Under `md` the same rail is a drawer over the transcript. The slide is short
 * and eases out; reduced motion keeps the fade and drops the movement.
 */
const drawerClass =
  "max-md:fixed max-md:top-12 max-md:bottom-0 max-md:start-0 max-md:transition-[transform,opacity,visibility] max-md:duration-200 max-md:ease-[var(--ease-drawer)] motion-reduce:max-md:transition-[opacity,visibility]";

const drawerOpenClass = "max-md:translate-x-0 max-md:opacity-100";

/**
 * A closed drawer is `invisible`, so its links leave the accessibility tree
 * too. Every class here is `max-md:`, because from `md` up the rail is a
 * column unless `collapsed` takes it out of the layout.
 */
const drawerClosedClass = "max-md:invisible max-md:-translate-x-full max-md:opacity-0";

/**
 * A rail row: one line, and instant. On the drawer the hit area is thumb-sized
 * (`h-11`); the desktop column stays the dense `h-8` so a long list stays
 * scannable. The press scale is the only movement — opening a thread is a
 * navigation, and a control reached this often should not make the analyst wait
 * for a transition to finish before the next one is readable. `data-thread-row`
 * carries the hover paint, which `globals.css` gates to a fine pointer so a tap
 * does not leave a row lit.
 */
const rowClass =
  "flex h-11 md:h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground/70 no-underline transition-[transform,background-color,color] duration-[120ms] ease-[var(--ease-out)] active:scale-[0.97]";

const currentRowClass = "bg-sidebar-accent text-sidebar-accent-foreground";

/**
 * Recents as a left column (issue #55 / #32; PRD story 17): the analyst's
 * threads by first question, and New thread above them. A header control
 * collapses the column from `md` up; on a narrow viewport the same rail is a
 * drawer that control opens.
 */
export function ThreadRail({
  threads,
  openThreadId,
  open,
  collapsed,
  onClose,
}: {
  threads: readonly ThreadSummary[];
  openThreadId: string | null;
  /** Whether the narrow-viewport drawer is showing. Ignored from `md` up. */
  open: boolean;
  /** Whether the desktop column is out of the layout. Ignored under `md`. */
  collapsed: boolean;
  /** Closes the drawer, once a destination is picked or the scrim is tapped. */
  onClose: () => void;
}) {
  const { newThread, rows } = threadRail(threads, openThreadId);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (recentsDrawerKey(event.key, open) !== "dismiss") {
        return;
      }
      event.preventDefault();
      onClose();
      document.getElementById(DRAWER_TOGGLE_ID)?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <aside
        id={RAIL_ID}
        className={cn(
          railClass,
          drawerClass,
          open ? drawerOpenClass : drawerClosedClass,
          collapsed && "md:hidden",
        )}
      >
        <div className="p-2">
          <RailLink destination={newThread} onClose={onClose}>
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
                  <RailLink destination={row} onClose={onClose}>
                    <span className="truncate">{row.title}</span>
                  </RailLink>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      {/* The transcript beside an open drawer is a scrim: reaching for it means
          dismissing the drawer, not asking a question through it. */}
      {open ? (
        <button
          type="button"
          aria-label={chatCopy.hideRecentsLabel}
          onClick={onClose}
          className="fixed inset-x-0 top-12 bottom-0 z-10 bg-background/60 md:hidden"
        />
      ) : null}
    </>
  );
}

/**
 * The header recents control: one for the narrow drawer, one for the desktop
 * column. Only one is drawn at a given width, so the bar still has a single
 * leading control, and each keeps an `aria-expanded` that matches what that
 * viewport actually shows.
 */
export function ThreadRailToggle({
  open,
  onToggle,
  collapsed,
  onCollapsedToggle,
}: {
  open: boolean;
  onToggle: () => void;
  collapsed: boolean;
  onCollapsedToggle: () => void;
}) {
  return (
    <>
      <RailToggle
        id={DRAWER_TOGGLE_ID}
        open={open}
        onToggle={onToggle}
        className="md:hidden"
      />
      <RailToggle
        open={!collapsed}
        onToggle={onCollapsedToggle}
        className="max-md:hidden"
      />
    </>
  );
}

function RailToggle({
  id,
  open,
  onToggle,
  className,
}: {
  id?: string;
  open: boolean;
  onToggle: () => void;
  className: string;
}) {
  return (
    <Button
      id={id}
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-expanded={open}
      aria-controls={RAIL_ID}
      onClick={onToggle}
    >
      <PanelLeftIcon aria-hidden="true" />
      <span className="sr-only">
        {open ? chatCopy.hideRecentsLabel : chatCopy.showRecentsLabel}
      </span>
    </Button>
  );
}

/**
 * One rail destination, drawn the same whether it is New thread or a recents
 * row: where it goes, whether the analyst is already there, and the drawer
 * closing behind the pick on a narrow viewport.
 */
function RailLink({
  destination,
  onClose,
  children,
}: {
  destination: RailDestination;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={destination.href}
      data-thread-row
      aria-current={destination.current ? "page" : undefined}
      onClick={onClose}
      className={cn(rowClass, destination.current && currentRowClass)}
    >
      {children}
    </Link>
  );
}
