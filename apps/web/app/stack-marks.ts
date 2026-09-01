import { landingCopy } from "./landing-copy.ts";

type StackName = (typeof landingCopy.builtOn)[number];

/** One product's logomark, filled with the strip's text colour on the zip palette. */
export type StackMark = {
  viewBox: string;
  path: string;
};

/**
 * The three products the Landing credits. Paths are the products' own marks
 * (Next.js N-in-circle, Convex chevron, Vercel triangle for the AI SDK), not
 * generic lucide stand-ins.
 */
export const stackMarks: Record<StackName, StackMark> = {
  "Next.js": {
    viewBox: "0 0 24 24",
    path: "M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l9.85 12.727Zm-3.332-8.533 1.6 2.061V7.2h-1.6v6.245Z",
  },
  Convex: {
    viewBox: "0 0 24 24",
    path: "M4.2 5.1A3.1 3.1 0 0 1 7.3 2h2.4c.7 0 1.36.3 1.82.82l7.16 8.18c.8.91.8 2.27 0 3.18l-7.16 8.18A2.4 2.4 0 0 1 9.7 23H7.3A3.1 3.1 0 0 1 4.2 19.9V5.1Z",
  },
  "Vercel AI SDK": {
    viewBox: "0 0 24 24",
    path: "M12 2 22 20H2L12 2z",
  },
};
