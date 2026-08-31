export const landingCopy = {
  sectionOrder: [
    "header",
    "hero",
    "demo",
    "builtOn",
    "suggestedQuestions",
    "howItWorks",
    "privacy",
    "footer",
  ],
  header: {
    wordmark: "Airport Investment Intelligence Agent",
    actions: [{ label: "Sign in", href: "/login" }],
  },
  hero: {
    title: "Airport Investment Intelligence Agent.",
    subtitle:
      "A capacity-pressure screen: ranked, explained, number-backed answers from public data, with assumptions stated.",
    actions: [{ label: "Start asking", href: "/chat" }],
  },
  demo: {
    live: false,
    prompt: "Compare congestion at LAX and SNA.",
    prose:
      "Los Angeles and Santa Ana stay two rows. These delay figures are composition only.",
    columns: ["Airport", "Delay rate", "Avg delay"],
    rows: [
      { airport: "LAX", delayRate: "22.4%", avgDelay: "14.8 min" },
      { airport: "SNA", delayRate: "18.1%", avgDelay: "11.2 min" },
    ],
  },
  builtOn: ["Next.js", "Convex", "Vercel AI SDK"],
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
      "Answers cite the committed snapshot vintage. This is not a weekly live refresh.",
  },
  privacy:
    "We log account email and the questions you ask. We never sell data.",
  footer: {
    githubLabel: "GitHub",
    githubHref: "https://github.com/davidFeldqwe/forward-deployed-exam",
  },
} as const;

type LandingCopy = typeof landingCopy;

export function visibleLandingText(copy: LandingCopy): string {
  return [
    copy.header.wordmark,
    ...copy.header.actions.map((action) => action.label),
    copy.hero.title,
    copy.hero.subtitle,
    ...copy.hero.actions.map((action) => action.label),
    copy.demo.prompt,
    copy.demo.prose,
    ...copy.demo.columns,
    ...copy.demo.rows.flatMap((row) => [
      row.airport,
      row.delayRate,
      row.avgDelay,
    ]),
    ...copy.builtOn,
    ...copy.suggestedQuestions,
    copy.howItWorks.heading,
    ...copy.howItWorks.steps,
    copy.howItWorks.caption,
    copy.privacy,
    copy.footer.githubLabel,
    copy.footer.githubHref,
  ].join("\n");
}
