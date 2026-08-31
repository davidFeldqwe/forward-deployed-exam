"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";

const chipMotion =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 fill-mode-both hover:bg-muted/40";

type PromptChipsProps = {
  questions: readonly string[];
} & (
  | { href: string | ((question: string) => string); onSelect?: never }
  | { href?: never; onSelect: (question: string) => void }
);

export function PromptChips({ questions, href, onSelect }: PromptChipsProps) {
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {questions.map((question, index) => {
        const chipHref = typeof href === "function" ? href(question) : href;
        return (
          <li key={question}>
            <Item
              variant="outline"
              size="sm"
              render={chipHref ? <Link href={chipHref} /> : <button type="button" />}
              onClick={onSelect ? () => onSelect(question) : undefined}
              className={onSelect ? `cursor-pointer text-start ${chipMotion}` : chipMotion}
              style={{ animationDelay: `${index * 40}ms`, animationDuration: "280ms" }}
            >
              <ItemContent>
                <ItemTitle className="line-clamp-none whitespace-normal font-normal">
                  {question}
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                <ArrowRightIcon aria-hidden="true" className="text-muted-foreground" />
              </ItemActions>
            </Item>
          </li>
        );
      })}
    </ul>
  );
}
