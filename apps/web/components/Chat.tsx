"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { signOut } from "@/app/auth-actions";
import { PROMPT_MAX_LENGTH } from "@/app/auth-gate";
import { chatCopy } from "@/app/chat-copy";
import { askQuestion } from "@/app/thread-actions";
import type { ThreadMessage } from "@/app/thread-messages";
import type { ThreadSummary } from "@/app/thread-store";
import { PromptChips } from "@/components/PromptChips";
import { PendingAnswer } from "@/components/answers/PendingAnswer";
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
  initialPrompt = null,
  threadId = null,
  messages = [],
  recents,
}: {
  initialPrompt?: string | null;
  threadId?: string | null;
  messages?: readonly ThreadMessage[];
  recents: readonly ThreadSummary[];
}) {
  // Which transcript is on screen, and how far it has got: a question that
  // landed changes it, and so does opening a different thread.
  const transcriptKey = `${threadId ?? ""}:${messages.length}`;

  const [draft, setDraft] = useState(initialPrompt ?? "");
  // Asking inside an open thread redirects back to the same route, so React
  // reconciles rather than remounts and this controlled field would still hold
  // the question that was just sent — one Send away from appending it twice.
  const [clearedFor, setClearedFor] = useState(transcriptKey);
  if (clearedFor !== transcriptKey) {
    setClearedFor(transcriptKey);
    setDraft("");
  }
  const ready = draft.trim().length > 0;

  // A thread that survived a refresh opens where the conversation is: at the
  // newest message, not scrolled back up to the first question.
  const transcriptPane = useRef<HTMLElement>(null);
  useEffect(() => {
    const pane = transcriptPane.current;
    if (pane) {
      pane.scrollTop = pane.scrollHeight;
    }
  }, [transcriptKey]);

  return (
    // Exactly the viewport, so a long transcript scrolls inside `main` instead
    // of growing the page and carrying the composer off the bottom of it.
    <div className="flex h-svh flex-col bg-background">
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

      {/* Transcript and composer are one form, so the pending answer above the
          composer can read the same submission `useFormStatus` reports on. */}
      <form action={askQuestion} className="flex min-h-0 flex-1 flex-col">
        {threadId ? <input type="hidden" name="threadId" value={threadId} /> : null}
        <main
          ref={transcriptPane}
          // `min-h-0`: a flex item's automatic minimum size is its content, so
          // without this the pane grows to fit the transcript and never scrolls.
          className="flex min-h-0 flex-1 justify-center overflow-y-auto"
          aria-label="Transcript"
        >
          <div className="w-full max-w-[820px] px-6 pt-7 pb-6">
            {messages.length === 0 ? (
              <PromptChips questions={chatCopy.chips} onSelect={setDraft} />
            ) : (
              <Transcript messages={messages} />
            )}
            {/* A question in flight: the pending row shows no scores, so a
                half-composite is never on screen. */}
            <PendingAnswer question={draft} />
          </div>
        </main>

        <div className="shrink-0 border-t bg-header">
          <div className="mx-auto max-w-[820px] px-6 pt-3 pb-4">
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
                // `askQuestion` bounds a question by the same maximum, so
                // stopping the field here means a long question is visibly
                // capped rather than silently cut on its way into the thread.
                maxLength={PROMPT_MAX_LENGTH}
                className="h-9 text-base md:text-base"
              />
              <InputGroupAddon align="inline-end">
                <SendButton ready={ready} />
              </InputGroupAddon>
            </InputGroup>
          </div>
        </div>
      </form>
    </div>
  );
}

/**
 * Send, held while the question is on its way into the Thread. The composer
 * only clears once the transcript comes back with the question in it, so until
 * then a second click would post the same question again and append it twice.
 * Rendered enabled on the server, so the form still sends without JavaScript.
 */
function SendButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();

  return (
    <InputGroupButton
      type="submit"
      size="sm"
      variant={ready ? "default" : "secondary"}
      disabled={pending}
    >
      {pending ? chatCopy.sendingLabel : chatCopy.sendLabel}
    </InputGroupButton>
  );
}
