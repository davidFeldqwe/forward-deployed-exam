/**
 * The thread rail (issue #55 / #32; PRD story 17): recents is a left column
 * beside the transcript, not a menu in the header. A header control collapses
 * the column from `md` up; under `md` the same list is a drawer. The data is
 * what it always was — `listThreads` hands back `{ id, title }`, newest first,
 * and the title is the thread's first user question — so this module only
 * decides where each row goes, which one the analyst is looking at, and whether
 * a key dismisses the drawer.
 *
 * Exactly one destination is current. An open thread lights its own row; an
 * empty chat lights **New thread**, because that is the destination the screen
 * is already showing. A `threadId` that recents does not hold (a restart drops
 * the in-process store) lights nothing, rather than pointing at a thread the
 * rail cannot open.
 */
import { CHAT_PATH, chatDestination } from "./auth-gate.ts";
import type { ThreadSummary } from "./thread-store.ts";

/** A place the rail can send the analyst, and whether they are already there. */
export type RailDestination = {
  href: string;
  current: boolean;
};

/** One recents row: the thread's first question, and where it opens. */
export type RailRow = RailDestination & {
  id: string;
  title: string;
};

export type ThreadRailView = {
  newThread: RailDestination;
  rows: RailRow[];
};

export function threadRail(
  threads: readonly ThreadSummary[],
  openThreadId: string | null,
): ThreadRailView {
  return {
    newThread: { href: CHAT_PATH, current: openThreadId === null },
    rows: threads.map(({ id, title }) => ({
      id,
      title,
      href: chatDestination(id),
      current: id === openThreadId,
    })),
  };
}

/** The narrow-viewport control Escape returns focus to after dismissing the drawer. */
export const DRAWER_TOGGLE_ID = "thread-rail-drawer-toggle";

/**
 * Escape closes the recents drawer. The desktop column stays: hiding it is the
 * header control, not a key that would also drop an open drawer on a phone.
 */
export function recentsDrawerKey(key: string, drawerOpen: boolean): "dismiss" | null {
  return drawerOpen && key === "Escape" ? "dismiss" : null;
}
