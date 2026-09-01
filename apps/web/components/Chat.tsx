"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { recentUserPrompts } from "@/app/autocomplete";
import { PROMPT_MAX_LENGTH } from "@/app/auth-gate";
import { askOnChatSse } from "@/app/chat-ask";
import { afterSuccessfulAsk } from "@/app/chat-land";
import { chatCopy } from "@/app/chat-copy";
import { applyChatStreamEvent, EMPTY_CHAT_STREAM } from "@/app/chat-stream";
import type { ThreadMessage } from "@/app/thread-messages";
import type { ThreadSummary } from "@/app/thread-store";
import { Composer } from "@/components/Composer";
import { PromptChips } from "@/components/PromptChips";
import { PendingAnswer } from "@/components/answers/PendingAnswer";
import { ComparisonWindow, SiteHeader } from "@/components/SiteHeader";
import { ThreadRail, ThreadRailToggle } from "@/components/ThreadRail";
import { Transcript } from "@/components/Transcript";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";

// `/chat` omits `messages`; reuse one empty list instead of a new `[]` each render.
const EMPTY_THREAD: readonly ThreadMessage[] = [];

export function Chat({
  initialPrompt = null,
  threadId = null,
  messages = EMPTY_THREAD,
  recents,
}: {
  initialPrompt?: string | null;
  threadId?: string | null;
  messages?: readonly ThreadMessage[];
  recents: readonly ThreadSummary[];
}) {
  const router = useRouter();

  function landThread(nextThreadId: string | null): void {
    const land = afterSuccessfulAsk(threadId ?? null, nextThreadId);
    if (land.kind === "refresh") {
      router.refresh();
      return;
    }
    router.push(land.href);
  }

  // Which transcript is on screen, and how far it has got: a question that
  // landed changes it, and so does opening a different thread.
  const transcriptKey = `${threadId ?? ""}:${messages.length}`;

  // The rail is a drawer only below `md`; from there up `collapsed` hides the
  // column. Each starts in the state that width already showed: drawer closed,
  // column on screen.
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);

  const [draft, setDraft] = useState(initialPrompt ?? "");
  // Send copies the trimmed draft here and empties the field. The pending turn
  // and the hidden `prompt` read this copy so a second click cannot post twice.
  const [asked, setAsked] = useState("");
  const [stream, setStream] = useState(EMPTY_CHAT_STREAM);
  // Opening a different thread (or the same route coming back with the landed
  // question) must not leave either the draft or that in-flight copy behind.
  const [clearedFor, setClearedFor] = useState(transcriptKey);
  if (clearedFor !== transcriptKey) {
    setClearedFor(transcriptKey);
    setDraft("");
    setAsked("");
    setStream(EMPTY_CHAT_STREAM);
  }
  const ready = draft.trim().length > 0;
  const formValue = ready ? draft : asked;

  function acceptQuestion(): void {
    const question = draft.trim();
    if (question.length === 0) {
      return;
    }
    setAsked(question);
    setDraft("");
    setStream(EMPTY_CHAT_STREAM);
  }

  // A thread that survived a refresh opens where the conversation is: at the
  // newest message, not scrolled back up to the first question. Growing stream
  // content keeps the pane pinned to the newest turn the same way.
  const transcriptPane = useRef<HTMLElement>(null);
  useEffect(() => {
    const pane = transcriptPane.current;
    if (pane) {
      pane.scrollTop = pane.scrollHeight;
    }
  }, [transcriptKey, asked, stream.text, stream.toolCalls.length]);

  return (
    // Exactly the viewport, so a long transcript scrolls inside `main` instead
    // of growing the page and carrying the composer off the bottom of it.
    <div className="flex h-svh flex-col bg-background">
      <SiteHeader
        signedIn
        current="chat"
        leading={
          <ThreadRailToggle
            open={railOpen}
            onToggle={() => setRailOpen((wasOpen) => !wasOpen)}
            collapsed={railCollapsed}
            onCollapsedToggle={() => setRailCollapsed((wasCollapsed) => !wasCollapsed)}
          />
        }
        status={<ComparisonWindow />}
      />

      {/* The rail is a column of its own from `md` up unless collapsed, and a
          drawer over the transcript below it. */}
      <div className="flex min-h-0 flex-1">
        <ThreadRail
          threads={recents}
          openThreadId={threadId}
          open={railOpen}
          collapsed={railCollapsed}
          onClose={() => setRailOpen(false)}
        />

        {/* Transcript and composer are one form so Send can wait on the SSE
            POST until the stream ends; the pending row sits in that wait. */}
        <form
          action={(formData) =>
            askOnChatSse(formData, landThread, (event) => {
              setStream((was) => applyChatStreamEvent(was, event));
            })
          }
          onSubmit={acceptQuestion}
          className="flex min-h-0 flex-1 flex-col"
          inert={railOpen}
        >
          {threadId ? <input type="hidden" name="threadId" value={threadId} /> : null}
          <main
            ref={transcriptPane}
            // `min-h-0`: a flex item's automatic minimum size is its content, so
            // without this the pane grows to fit the transcript and never scrolls.
            className="flex min-h-0 flex-1 justify-center overflow-y-auto"
            aria-label="Transcript"
          >
            <div className="w-full max-w-[820px] px-6 pt-7 pb-6">
              {messages.length === 0 && asked.length === 0 ? (
                <PromptChips questions={chatCopy.chips} onSelect={setDraft} />
              ) : (
                <Transcript messages={messages} />
              )}
              {/* A question in flight: the pending row shows no scores until a
                  complete queryAirports payload, so a half-composite is never
                  on screen. Kept until the landed transcript replaces it. */}
              <PendingAnswer question={asked} messages={messages} stream={stream} />
            </div>
          </main>

          <div className="shrink-0 border-t bg-header">
            <div className="mx-auto max-w-[820px] px-6 pt-3 pb-4">
              <InputGroup className="h-auto min-h-11 items-end py-1 pe-1 ps-1">
                <Composer
                  id="chat-draft"
                  value={draft}
                  formValue={formValue}
                  onChange={setDraft}
                  recentPrompts={recentUserPrompts(messages)}
                  placeholder={chatCopy.composerPlaceholder}
                  maxLength={PROMPT_MAX_LENGTH}
                />
                <InputGroupAddon align="inline-end" className="py-0">
                  <SendButton ready={ready} />
                </InputGroupAddon>
              </InputGroup>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Send, held while the question is on its way into the Thread. `ready` is the
 * trimmed draft still in the field — a carried prompt on first paint is enabled
 * in the initial HTML; an empty field or an in-flight ask is not.
 */
function SendButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();

  return (
    <InputGroupButton
      type="submit"
      size="icon-sm"
      variant={ready ? "default" : "secondary"}
      disabled={!ready || pending}
      aria-label={pending ? chatCopy.sendingLabel : chatCopy.sendLabel}
    >
      <ArrowUpIcon aria-hidden="true" />
    </InputGroupButton>
  );
}
