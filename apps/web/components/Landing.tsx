import { Fragment } from "react";
import Link from "next/link";
import { ArrowRightIcon, GitBranchIcon } from "lucide-react";

import { chatPathWithPrompt } from "@/app/auth-gate";
import { landingCopy } from "@/app/landing-copy";
import { stackMarks } from "@/app/stack-marks";
import { PromptChips } from "@/components/PromptChips";
import { SiteHeader } from "@/components/SiteHeader";
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
  const { hero, demo, builtOn, suggestedQuestions, howItWorks, privacy, footer } =
    landingCopy;

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader signedIn={false} />

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
                size="lg"
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
          className="mx-auto mb-12 w-full max-w-[720px] px-6"
          aria-label="Built on"
        >
          <p className="mb-3.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Built on
          </p>
          <ul className="flex list-none flex-nowrap items-stretch gap-3 overflow-x-auto p-0">
            {builtOn.map((item) => {
              const mark = stackMarks[item];
              return (
                <li key={item} className="shrink-0">
                  <span className="flex items-center gap-2.5 rounded-lg border bg-card px-3.5 py-2.5 text-sm text-foreground">
                    <svg
                      viewBox={mark.viewBox}
                      aria-hidden="true"
                      className="size-5 shrink-0"
                    >
                      <path fill="currentColor" d={mark.path} />
                    </svg>
                    {item}
                  </span>
                </li>
              );
            })}
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
          <PromptChips
            questions={suggestedQuestions}
            href={suggestedQuestions.map(chatPathWithPrompt)}
          />
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
          <ol className="flex list-none flex-wrap items-stretch gap-y-2 p-0">
            {howItWorks.steps.map((step, index) => (
              <Fragment key={step}>
                {index > 0 && (
                  <li aria-hidden="true" className="flex shrink-0 items-center">
                    <ArrowRightIcon className="mx-1.5 size-3 text-muted-foreground" />
                  </li>
                )}
                <li className="flex min-h-[4.75rem] min-w-[6.25rem] flex-1 basis-0">
                  <div className="flex h-full w-full items-center justify-center rounded-lg border bg-card px-2.5 py-3 text-center text-xs leading-snug text-foreground">
                    {step}
                  </div>
                </li>
              </Fragment>
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

      <footer className="flex justify-center px-6 pt-5 pb-7">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          className="text-muted-foreground"
          render={<a href={footer.githubHref} target="_blank" rel="noreferrer" />}
        >
          <GitBranchIcon aria-hidden="true" />
          {footer.githubLabel}
        </Button>
      </footer>
    </div>
  );
}
