"use client";

import { useState } from "react";

import { signOut } from "@/app/auth-actions";
import { chatCopy } from "@/app/chat-copy";
import { askQuestion } from "@/app/thread-actions";
import type { ThreadMessage, ThreadSummary } from "@/app/threads";
import { PromptChips } from "@/components/PromptChips";
import { ThreadMenu } from "@/components/ThreadMenu";
import { Transcript } from "@/components/Transcript";
import { Wordmark } from "@/components/Wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export function Chat({
  initialPrompt,
  threadId = null,
  messages = [],
  recents = [],
}: {
  initialPrompt: string | null;
  threadId?: string | null;
  messages?: readonly ThreadMessage[];
  recents?: readonly ThreadSummary[];
}) {
  const [draft, setDraft] = useState(initialPrompt ?? "");
  const ready = draft.trim().length > 0;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="h-12 shrink-0 border-b bg-header">
        <div className="mx-auto flex h-full max-w-[820px] items-center justify-between gap-4 px-6">
          <Wordmark name={chatCopy.wordmark} />
          <div className="flex shrink-0 items-center gap-3">
            <Badge variant="outline" className="font-mono text-[11.5px] font-normal">
              {chatCopy.comparisonWindow}
            </Badge>
            <ThreadMenu threads={recents} openThreadId={threadId} />
            <form action={signOut}>
              <Button type="submit" variant="link" size="sm">
                {chatCopy.signOutLabel}
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex flex-1 justify-center overflow-y-auto" aria-label="Transcript">
        <div className="w-full max-w-[820px] px-6 pt-7 pb-6">
          {messages.length === 0 ? (
            <PromptChips questions={chatCopy.chips} onSelect={setDraft} />
          ) : (
            <Transcript messages={messages} />
          )}
        </div>
      </main>

      <div className="shrink-0 border-t bg-header">
        <div className="mx-auto max-w-[820px] px-6 pt-3 pb-4">
          <form action={askQuestion}>
            {threadId ? <input type="hidden" name="threadId" value={threadId} /> : null}
            <InputGroup className="h-auto min-h-11 py-1 pe-1 ps-1">
              <label className="sr-only" htmlFor="chat-draft">
                {chatCopy.composerPlaceholder}
              </label>
              <InputGroupInput
                id="chat-draft"
                name="prompt"
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
