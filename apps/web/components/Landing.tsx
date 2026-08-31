import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { chatPathWithPrompt } from "@/app/auth-gate";
import { landingCopy } from "@/app/landing-copy";
import { PromptChips } from "@/components/PromptChips";
import { Wordmark } from "@/components/Wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function Landing() {
  const { header, hero, demo, builtOn, suggestedQuestions, howItWorks, privacy, footer } =
    landingCopy;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="h-12 shrink-0 border-b bg-header">
        <div className="mx-auto flex h-full max-w-[720px] items-center justify-between gap-4 px-6">
          <Wordmark name={header.wordmark} />
          {header.actions.map((action) => (
            <Button
              key={action.href}
              variant="link"
              size="sm"
              nativeButton={false}
              render={<Link href={action.href} />}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section
          className="relative bg-[linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] bg-[size:28px_28px] py-[72px] pb-[88px]"
          aria-labelledby="hero-title"
        >
          <div className="mx-auto max-w-[720px] px-6">
            <h1
              id="hero-title"
              className="mb-4 text-[36px] leading-[1.15] font-medium tracking-[-0.03em] text-foreground"
            >
              {hero.title}
            </h1>
            <p className="mb-7 max-w-[38rem] text-base leading-normal text-body">
              {hero.subtitle}
            </p>
            {hero.actions.map((action) => (
              <Button
                key={action.href}
                size="sm"
                nativeButton={false}
                render={<Link href={action.href} />}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-[-48px] mb-14 w-full max-w-[720px] px-6" aria-label="Fixture comparison">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="font-mono text-[12.5px]">{demo.prompt}</CardTitle>
              <CardDescription className="text-[13px] leading-snug">
                {demo.prose}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-row-head hover:bg-row-head">
                    {demo.columns.map((column) => (
                      <TableHead
                        key={column}
                        className="h-auto px-2.5 py-2 text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase"
                      >
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demo.rows.map((row) => (
                    <TableRow key={row.airport}>
                      <TableCell className="p-2.5 text-body">{row.airport}</TableCell>
                      <TableCell className="p-2.5 font-mono text-[12.5px] text-foreground">
                        {row.delayRate}
                      </TableCell>
                      <TableCell className="p-2.5 font-mono text-[12.5px] text-foreground">
                        {row.avgDelay}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <section
          className="mx-auto mb-12 flex w-full max-w-[720px] flex-nowrap items-baseline gap-x-[18px] gap-y-2.5 overflow-x-auto px-6 text-xs text-muted-foreground"
          aria-label="Built on"
        >
          <span className="tracking-[0.08em] uppercase">Built on</span>
          <ul className="flex list-none flex-nowrap gap-x-4 gap-y-2 p-0 text-body">
            {builtOn.map((item) => (
              <li key={item}>
                <Badge variant="outline">{item}</Badge>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="mx-auto mb-14 w-full max-w-[720px] px-6"
          aria-labelledby="questions-heading"
        >
          <h2
            id="questions-heading"
            className="mb-3.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
          >
            Try one of these questions
          </h2>
          <PromptChips questions={suggestedQuestions} href={chatPathWithPrompt} />
        </section>

        <section
          className="mx-auto mb-14 w-full max-w-[720px] px-6"
          aria-labelledby="how-heading"
        >
          <h2
            id="how-heading"
            className="mb-3.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
          >
            {howItWorks.heading}
          </h2>
          <ol className="flex list-none flex-nowrap items-stretch overflow-x-auto p-0">
            {howItWorks.steps.map((step, index) => (
              <li key={step} className="flex min-w-0 flex-1 items-center">
                <div className="min-w-0 flex-1 rounded-lg border bg-card px-2.5 py-3 text-xs leading-snug text-foreground">
                  {step}
                </div>
                {index < howItWorks.steps.length - 1 ? (
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="mx-1.5 size-3 shrink-0 text-muted-foreground"
                  />
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-3.5 text-[13px] leading-snug text-muted-foreground">
            {howItWorks.caption}
          </p>
        </section>

        <section className="w-full border-y bg-raised px-6 py-4 text-center text-[13px] text-body" aria-label="Privacy">
          <p className="mx-auto max-w-[720px]">{privacy}</p>
        </section>
      </main>

      <footer className="px-6 pt-5 pb-7 text-center text-[13px]">
        <a href={footer.githubHref}>{footer.githubLabel}</a>
      </footer>
    </div>
  );
}
