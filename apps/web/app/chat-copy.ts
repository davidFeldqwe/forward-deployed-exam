/** Chat content. The header it sits under is `app/site-header.ts`. */
export const chatCopy = {
  comparisonWindow: "Comparison window 2023–2024",
  /** The same window on a phone-width bar, where the phrase does not fit. */
  comparisonWindowYears: "2023–2024",
  composerPlaceholder: "Ask about an airport…",
  sendLabel: "Send",
  sendingLabel: "Sending…",
  recentsLabel: "Recents",
  newThreadLabel: "New thread",
  noRecentsLabel: "No threads yet — ask a question to start one.",
  /** The narrow-viewport control that slides the recents rail in and out. */
  showRecentsLabel: "Show recents",
  hideRecentsLabel: "Hide recents",
  chips: [
    "Which airports in New England are renovation-investment candidates?",
    "Compare congestion at Los Angeles and Santa Ana.",
    "What is long-haul share out of Anchorage?",
    "How much unmet flight demand is there at SFO?",
  ],
} as const;
