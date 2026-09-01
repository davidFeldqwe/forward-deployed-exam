/**
 * Chat content. The header it sits under is `app/site-header.ts`, and so is the
 * comparison window it shows there: the map names the same two years.
 */
export const chatCopy = {
  composerPlaceholder: "Ask about an airport…",
  sendLabel: "Send",
  sendingLabel: "Sending…",
  recentsLabel: "Recents",
  newThreadLabel: "New thread",
  noRecentsLabel: "No threads yet — ask a question to start one.",
  /** The control that shows and hides recents: a column on desktop, a drawer on a narrow viewport. */
  showRecentsLabel: "Show recents",
  hideRecentsLabel: "Hide recents",
  chips: [
    "Which airports in New England are renovation-investment candidates?",
    "Compare congestion at Los Angeles and Santa Ana.",
    "What is long-haul share out of Anchorage?",
    "How much unmet flight demand is there at SFO?",
  ],
} as const;
