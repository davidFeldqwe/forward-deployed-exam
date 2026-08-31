"use client";

import { useState } from "react";

import { chatCopy } from "@/app/chat-copy";
import { PromptChips } from "@/components/PromptChips";
import { Wordmark } from "@/components/Wordmark";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export function Chat() {
  const [draft, setDraft] = useState("");
  const ready = draft.trim().length > 0;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="h-12 shrink-0 border-b bg-header">
        <div className="mx-auto flex h-full max-w-[820px] items-center justify-between gap-4 px-6">
          <Wordmark name={chatCopy.wordmark} />
          <Badge variant="outline" className="font-mono text-[11.5px] font-normal">
            {chatCopy.comparisonWindow}
          </Badge>
        </div>
      </header>

      <main className="flex flex-1 justify-center overflow-y-auto" aria-label="Transcript">
        <div className="w-full max-w-[820px] px-6 pt-7 pb-6">
          <PromptChips questions={chatCopy.chips} onSelect={setDraft} />
        </div>
      </main>

      <div className="shrink-0 border-t bg-header">
        <div className="mx-auto max-w-[820px] px-6 pt-3 pb-4">
          <form
            onSubmit={(event) => event.preventDefault()}
          >
            <InputGroup className="h-auto min-h-11 py-1 pe-1 ps-1">
              <label className="sr-only" htmlFor="chat-draft">
                {chatCopy.composerPlaceholder}
              </label>
              <InputGroupInput
                id="chat-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={chatCopy.composerPlaceholder}
                className="h-9 text-base md:text-base"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="submit"
                  size="sm"
                  variant={ready ? "default" : "secondary"}
                >
                  {chatCopy.sendLabel}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </div>
      </div>
    </div>
  );
}
