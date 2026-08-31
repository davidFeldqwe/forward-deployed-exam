"use client";

import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { ChevronDownIcon, PlusIcon } from "lucide-react";

import { CHAT_PATH, chatDestination } from "@/app/auth-gate";
import { chatCopy } from "@/app/chat-copy";
import type { ThreadSummary } from "@/app/threads";
import { Button } from "@/components/ui/button";

const itemClass =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground no-underline outline-none select-none data-[highlighted]:bg-muted";

/** Recents in the chat header: the analyst's threads, and a new one. No rail. */
export function ThreadMenu({
  threads,
  openThreadId,
}: {
  threads: readonly ThreadSummary[];
  openThreadId: string | null;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger render={<Button variant="ghost" size="sm" />}>
        {chatCopy.recentsLabel}
        <ChevronDownIcon aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          {/* Recents grows with the analyst's threads, so the popup scrolls
              rather than running off the bottom of the window. */}
          <Menu.Popup className="max-h-[min(60svh,20rem)] w-[320px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
            <Menu.LinkItem closeOnClick className={itemClass} render={<Link href={CHAT_PATH} />}>
              <PlusIcon aria-hidden="true" className="text-muted-foreground" />
              {chatCopy.newThreadLabel}
            </Menu.LinkItem>
            <Menu.Separator className="my-1 h-px bg-border" />
            {threads.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                {chatCopy.noRecentsLabel}
              </p>
            ) : (
              threads.map((thread) => (
                <Menu.LinkItem
                  key={thread.id}
                  closeOnClick
                  className={itemClass}
                  aria-current={thread.id === openThreadId ? "page" : undefined}
                  render={<Link href={chatDestination(thread.id)} />}
                >
                  <span className="truncate">{thread.title}</span>
                </Menu.LinkItem>
              ))
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
