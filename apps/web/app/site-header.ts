/**
 * The shared site header (issue #53; PRD stories 2, 8, 16). Landing and chat
 * wear one bar, so the product does not read as two apps: the same identity on
 * the left, the same actions on the right, always on screen.
 *
 * This module is what is in the bar — the one product name, the two links, and
 * which way the profile control goes. `components/SiteHeader.tsx` is how it
 * looks, and the chat-only chrome (comparison window, recents drawer control)
 * is passed in by the surface that has it.
 *
 * The profile control is one icon with two behaviours rather than a menu:
 * signed out it is the way into `/login`, signed in it is the way out of the
 * session. There is no account page behind it to open.
 */
import { CHAT_PATH, LOGIN_PATH } from "./auth-gate.ts";

export const siteHeaderCopy = {
  /** The product name, and the only one: Landing, chat and login all show it. */
  wordmark: "Airport Investment Intelligence Agent",
  chatLabel: "Chat",
  githubLabel: "GitHub",
  /** The exam repository, credited in the bar and in the Landing footer. */
  githubHref: "https://github.com/davidFeldqwe/forward-deployed-exam",
  signInLabel: "Sign in",
  signOutLabel: "Sign out",
} as const;

/** One header action: where it goes, and whether it leaves the product. */
export type HeaderLink = {
  key: "chat" | "github";
  label: string;
  href: string;
  external: boolean;
};

/** The profile control: the way in when signed out, the way out when signed in. */
export type ProfileControl =
  | { kind: "signIn"; label: string; href: string }
  | { kind: "signOut"; label: string };

export type SiteHeaderView = {
  wordmark: string;
  links: readonly HeaderLink[];
  profile: ProfileControl;
};

export function siteHeader(signedIn: boolean): SiteHeaderView {
  return {
    wordmark: siteHeaderCopy.wordmark,
    // Chat first: it is the product. GitHub is the credit beside it.
    links: [
      {
        key: "chat",
        label: siteHeaderCopy.chatLabel,
        href: CHAT_PATH,
        external: false,
      },
      {
        key: "github",
        label: siteHeaderCopy.githubLabel,
        href: siteHeaderCopy.githubHref,
        external: true,
      },
    ],
    // A signed-out visitor who follows the chat link is still gated: `/chat`
    // redirects to login, so the header cannot run the agent as a guest.
    profile: signedIn
      ? { kind: "signOut", label: siteHeaderCopy.signOutLabel }
      : { kind: "signIn", label: siteHeaderCopy.signInLabel, href: LOGIN_PATH },
  };
}
