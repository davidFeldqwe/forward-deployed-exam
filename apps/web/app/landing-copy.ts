import { siteHeaderCopy } from "./site-header.ts";

/** Landing content. The header it sits under is `app/site-header.ts`. */
export const landingCopy = {
  hero: {
    title: "Airport Investment Intelligence Agent.",
    subtitle:
      "A capacity-pressure screen: ranked, explained, number-backed answers; scores from public data; assumptions stated.",
    actions: [{ label: "Start asking", href: "/chat" }],
  },
  demo: {
    prompt: "Compare congestion at LAX and SNA.",
    prose:
      "Delay is arrival delay minutes with weather removed. Los Angeles and Santa Ana stay two rows.",
    columns: ["Airport", "Delay rate", "Avg delay"],
    rows: [
      { airport: "LAX", delayRate: "22.4%", avgDelay: "14.8 min" },
      { airport: "SNA", delayRate: "18.1%", avgDelay: "11.2 min" },
    ],
  },
  builtOn: ["Next.js", "Convex", "Vercel AI SDK", "Anthropic"],
  suggestedQuestions: [
    "Which airports in New England are renovation-investment candidates?",
    "Compare congestion at Los Angeles and Santa Ana.",
    "What is long-haul share out of Anchorage?",
    "How much unmet flight demand is there at SFO?",
  ],
  howItWorks: {
    heading: "How it works",
    steps: [
      "Ask in plain English",
      "Chat UI (streaming)",
      "Agent tools",
      "Committed snapshot",
      "Public source vintage",
    ],
    caption:
      "Answers cite the committed snapshot vintage for the comparison window.",
  },
  privacy:
    "We log account email and the questions you ask. We never sell data.",
  // The footer credit and the header action are the one repository.
  footer: {
    githubLabel: siteHeaderCopy.githubLabel,
    githubHref: siteHeaderCopy.githubHref,
  },
} as const;
