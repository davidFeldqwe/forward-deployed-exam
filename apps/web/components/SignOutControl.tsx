"use client";

import { Dialog } from "@base-ui/react/dialog";
import { LogOutIcon } from "lucide-react";

import { signOut } from "@/app/auth-actions";
import { siteHeaderCopy } from "@/app/site-header";
import { Button } from "@/components/ui/button";

/**
 * The header's signed-in profile control (issue #93). A press opens a
 * confirmation; only that confirm POSTs `signOut`. Cancel is Dialog.Close, so
 * it cannot end the session. Own client module: Dialog state stays here so the
 * rest of the bar does not have to be a client tree.
 */
export function SignOutControl({ label }: { label: string }) {
  return (
    <Dialog.Root>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        nativeButton={false}
        className="text-muted-foreground"
        render={<Dialog.Trigger />}
      >
        <LogOutIcon aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-4 text-card-foreground ring-1 ring-border outline-none">
          <Dialog.Title className="text-base font-medium tracking-[-0.02em]">
            {siteHeaderCopy.signOutConfirmTitle}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
            {siteHeaderCopy.signOutConfirmDescription}
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Dialog.Close />}
            >
              {siteHeaderCopy.signOutCancelLabel}
            </Button>
            <form action={signOut}>
              <Button type="submit" size="sm">
                {siteHeaderCopy.signOutLabel}
              </Button>
            </form>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
