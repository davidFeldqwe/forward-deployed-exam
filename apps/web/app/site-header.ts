/**
 * The shared site header (issue #53; PRD stories 2, 8, 16). Landing, chat and
 * `/map` wear one bar, so the product does not read as three apps: the same
 * identity on the left, the same actions on the right, always on screen.
 *
 * This module is what is in the bar — the one product name, the three actions,
 * which of them the visitor is already on, and which way the profile control
 * goes. `components/SiteHeader.tsx` is how it looks, and the chrome a single
 * surface brings (chat's recents drawer control) is passed in by that surface.
 *
 * The profile control is one icon with two behaviours rather than a menu:
 * signed out it is the way into `/login`, signed in it is the way out of the
 * session. There is no account page behind it to open.
 */
import { CHAT_PATH, LOGIN_PATH, MAP_PATH } from "./auth-gate.ts";

export const siteHeaderCopy = {
  /** The product name, and the only one: Landing, chat and login all show it. */
  wordmark: "Airport Investment Intelligence Agent",
  chatLabel: "Chat",
  mapLabel: "Map",
  /**
   * The two years every number on both product surfaces is computed over. It is
   * header chrome rather than chat's, because chat and the map each name it in
   * the same bar — one string, so the two surfaces cannot claim two windows.
   */
  comparisonWindow: "Comparison window 2023–2024",
  /** The same window on a phone-width bar, where the phrase does not fit. */
  comparisonWindowYears: "2023–2024",
  githubLabel: "GitHub",
  /** The exam repository, credited in the bar and in the Landing footer. */
  githubHref: "https://github.com/davidFeldqwe/forward-deployed-exam",
  signInLabel: "Sign in",
  signOutLabel: "Sign out",
} as const;

/** One header action: where it goes, and whether it leaves the product. */
export type HeaderLink = {
  key: "chat" | "map" | "github";
  label: string;
  href: string;
  external: boolean;
  /** True on the surface this action opens: the one the visitor is already on. */
  current: boolean;
};

/**
 * Which of the product's own surfaces is drawing the bar, so its control reads
 * as current rather than as somewhere else to go. Landing is not one: it is the
 * brochure the header links away from, and no action opens it.
 */
export type HeaderSurface = "chat" | "map";

/** The profile control: the way in when signed out, the way out when signed in. */
export type ProfileControl =
  | { kind: "signIn"; label: string; href: string }
  | { kind: "signOut"; label: string };

export type SiteHeaderView = {
  wordmark: string;
  links: readonly HeaderLink[];
  profile: ProfileControl;
};

export function siteHeader(signedIn: boolean, surface?: HeaderSurface): SiteHeaderView {
  return {
    wordmark: siteHeaderCopy.wordmark,
    // Chat first: it is the product. The public map is the surface beside it,
    // and GitHub is the credit at the end.
    links: [
      {
        key: "chat",
        label: siteHeaderCopy.chatLabel,
        href: CHAT_PATH,
        external: false,
        current: surface === "chat",
      },
      {
        key: "map",
        label: siteHeaderCopy.mapLabel,
        href: MAP_PATH,
        external: false,
        current: surface === "map",
      },
      {
        key: "github",
        label: siteHeaderCopy.githubLabel,
        href: siteHeaderCopy.githubHref,
        external: true,
        // A link off the product is never where the visitor already is.
        current: false,
      },
    ],
    // A signed-out visitor who follows the chat link is still gated: `/chat`
    // redirects to login, so the header cannot run the agent as a guest.
    profile: signedIn
      ? { kind: "signOut", label: siteHeaderCopy.signOutLabel }
      : { kind: "signIn", label: siteHeaderCopy.signInLabel, href: LOGIN_PATH },
  };
}
