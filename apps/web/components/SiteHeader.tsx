import type { ReactNode } from "react";
import Link from "next/link";
import { GitBranchIcon, LogOutIcon, MapIcon, MessageSquareIcon, UserIcon } from "lucide-react";

import { signOut } from "@/app/auth-actions";
import {
  type HeaderLink,
  type HeaderSurface,
  type ProfileControl,
  siteHeader,
  siteHeaderCopy,
} from "@/app/site-header";
import { Wordmark } from "@/components/Wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Site chrome: pinned to the top of the viewport, edge to edge, with the bar's
 * content padded off the sides rather than squeezed into the page column. It
 * never enters or leaves — it is always there. `z-30` puts it over the recents
 * drawer (`z-20`) and the scrim under it (`z-10`); the drawer opens below the
 * bar, at `top-12`, which is this height.
 */
const barClass =
  "sticky top-0 z-30 flex h-12 w-full shrink-0 items-center gap-1.5 border-b bg-header px-4 md:gap-3 md:px-6";

/** The glyph for each action, so the pure module holds no components. */
const LINK_ICONS = {
  chat: MessageSquareIcon,
  map: MapIcon,
  github: GitBranchIcon,
} as const;

/**
 * The header Landing, chat and `/map` share (issue #53): identity on the left,
 * chat, Map, GitHub and the profile control on the right. A surface with chrome
 * of its own hands it in — chat's recents control leads the bar, beside the
 * rail it opens, and the comparison window sits with the actions.
 */
export function SiteHeader({
  signedIn,
  current,
  leading,
  status,
}: {
  signedIn: boolean;
  /** The surface drawing the bar, so its own action reads as where we are. */
  current?: HeaderSurface;
  /** A control at the leading edge: chat's recents show/hide button. */
  leading?: ReactNode;
  /** What this surface says about itself, ahead of the actions: the window. */
  status?: ReactNode;
}) {
  const { wordmark, links, profile } = siteHeader(signedIn, current);

  return (
    <header className={barClass}>
      {leading}

      {/* Identity takes the room the actions do not: on a phone the product
          name is clipped rather than pushing a control off the bar. */}
      <div className="min-w-0 flex-1">
        <Wordmark name={wordmark} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
        {status}
        {links.map((link) => (
          <HeaderAction key={link.key} link={link} />
        ))}
        <Profile control={profile} />
      </div>
    </header>
  );
}

/**
 * One action: a glyph, and a label a phone reads but does not draw. Grey until
 * hovered — indigo in this product is send, focus and prose links. The surface
 * the visitor is already on takes the foreground and says so with
 * `aria-current`, so "which surface is this" is not left to the palette.
 */
function HeaderAction({ link }: { link: HeaderLink }) {
  const Icon = LINK_ICONS[link.key];

  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      aria-current={link.current ? "page" : undefined}
      className={cn("px-2 md:px-3", link.current ? "text-foreground" : "text-muted-foreground")}
      render={
        link.external ? (
          <a href={link.href} target="_blank" rel="noreferrer" />
        ) : (
          <Link href={link.href} />
        )
      }
    >
      <Icon aria-hidden="true" />
      <span className="max-sm:sr-only">{link.label}</span>
    </Button>
  );
}

/**
 * The profile control. Icon-only on both surfaces, because the name of what it
 * does is the whole of what it does: reach login, or end the session. The two
 * glyphs differ so a press is never a surprise.
 */
function Profile({ control }: { control: ProfileControl }) {
  if (control.kind === "signIn") {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        nativeButton={false}
        className="text-muted-foreground"
        render={<Link href={control.href} />}
      >
        <UserIcon aria-hidden="true" />
        <span className="sr-only">{control.label}</span>
      </Button>
    );
  }

  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="icon-sm" className="text-muted-foreground">
        <LogOutIcon aria-hidden="true" />
        <span className="sr-only">{control.label}</span>
      </Button>
    </form>
  );
}

/**
 * The two years every number on the surface below was computed over. Both chat
 * and the map hand it to the bar's `status` slot, so the window is named once
 * and read the same way on either. Below `md` the phrase gives way to the years
 * it is about, which is what has to survive a phone-width bar.
 */
export function ComparisonWindow() {
  return (
    <Badge variant="outline" className="font-mono text-[11.5px] font-normal">
      <span className="max-md:hidden">{siteHeaderCopy.comparisonWindow}</span>
      <span className="md:hidden">{siteHeaderCopy.comparisonWindowYears}</span>
    </Badge>
  );
}
