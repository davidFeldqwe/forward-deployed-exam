"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $nodesOfType,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  DELETE_CHARACTER_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
  type LexicalEditor,
} from "lexical";

import {
  AUTOCOMPLETE_PATH,
  GHOST_PAUSE_MS,
  normalizeSuggestion,
} from "@/app/autocomplete";
import { clip } from "@/app/text";
import { $createGhostNode, $isGhostNode, GhostNode } from "@/components/ghost-node";

const editorConfig = {
  namespace: "ThreadComposer",
  theme: {
    ghost: "text-muted-foreground pointer-events-none",
  },
  onError(error: Error) {
    throw error;
  },
  nodes: [GhostNode],
};

export function Composer({
  id,
  value,
  formValue,
  onChange,
  recentPrompts,
  placeholder,
  maxLength,
}: {
  id: string;
  value: string;
  formValue: string;
  onChange: (value: string) => void;
  recentPrompts: readonly string[];
  placeholder: string;
  maxLength: number;
}) {
  return (
    <LexicalComposer initialConfig={editorConfig}>
      {/* One empty row is Send's size-8; wrapping grows downward from there. */}
      <div className="relative min-h-8 min-w-0 flex-1">
        <label className="sr-only" htmlFor={id}>
          {placeholder}
        </label>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              id={id}
              aria-placeholder={placeholder}
              placeholder={
                <div className="pointer-events-none absolute inset-0 z-0 flex items-center px-3 text-base leading-6 text-muted-foreground md:text-base">
                  {placeholder}
                </div>
              }
              data-slot="input-group-control"
              className="relative z-10 block min-h-8 max-h-32 overflow-x-hidden overflow-y-auto px-3 py-1 text-base leading-6 break-words outline-none md:text-base [&_p]:my-0"
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <input type="hidden" name="prompt" value={formValue} />
      </div>
      <SyncDraftPlugin maxLength={maxLength} value={value} />
      <DraftChangePlugin maxLength={maxLength} onChange={onChange} />
      <GhostKeysPlugin />
      <GhostFetchPlugin recentPrompts={recentPrompts} />
    </LexicalComposer>
  );
}

function $removeGhosts(): void {
  for (const node of $nodesOfType(GhostNode)) {
    node.remove();
  }
}

function $draftText(): string {
  return $getRoot().getTextContent();
}

function SyncDraftPlugin({ value, maxLength }: { value: string; maxLength: number }) {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    editor.update(() => {
      $removeGhosts();
      if ($draftText() === value) {
        return;
      }
      const paragraph = $createParagraphNode();
      const clipped = clip(value, maxLength);
      if (clipped.length > 0) {
        paragraph.append($createTextNode(clipped));
      }
      $getRoot().clear();
      $getRoot().append(paragraph);
    });
  }, [editor, maxLength, value]);

  return null;
}

function DraftChangePlugin({
  onChange,
  maxLength,
}: {
  onChange: (value: string) => void;
  maxLength: number;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        onChange(clip($draftText(), maxLength));
      });
    });
  }, [editor, maxLength, onChange]);

  return null;
}

function $dismissAndContinue(): false {
  $removeGhosts();
  return false;
}

function $acceptGhost(event: KeyboardEvent | null): boolean {
  const [ghost] = $nodesOfType(GhostNode);
  if (!$isGhostNode(ghost)) {
    return false;
  }
  event?.preventDefault();
  const text = $createTextNode(ghost.continuation());
  ghost.replace(text);
  text.selectEnd();
  return true;
}

function $insertGhost(suggestion: string): void {
  $removeGhosts();
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    selection.insertNodes([$createGhostNode(suggestion)]);
    return;
  }
  $getRoot().getLastChild()?.selectEnd();
  const next = $getSelection();
  if ($isRangeSelection(next)) {
    next.insertNodes([$createGhostNode(suggestion)]);
  }
}

function GhostKeysPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const stop = [
      editor.registerCommand(CONTROLLED_TEXT_INSERTION_COMMAND, $dismissAndContinue, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DELETE_CHARACTER_COMMAND, $dismissAndContinue, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(PASTE_COMMAND, $dismissAndContinue, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_TAB_COMMAND, $acceptGhost, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if ($nodesOfType(GhostNode).length === 0) {
            return false;
          }
          $removeGhosts();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          event?.preventDefault();
          $removeGhosts();
          const form = editor.getRootElement()?.closest("form");
          const send = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
          if (form && send && !send.disabled) {
            form.requestSubmit(send);
          }
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    ];

    const form = editor.getRootElement()?.closest("form");
    const dismissOnSend = () => {
      editor.update(() => {
        $removeGhosts();
      });
    };
    form?.addEventListener("submit", dismissOnSend);

    return () => {
      for (const unregister of stop) {
        unregister();
      }
      form?.removeEventListener("submit", dismissOnSend);
    };
  }, [editor]);

  return null;
}

function suggestionFromBody(partial: string, body: unknown): string | null {
  const raw =
    typeof body === "object" && body !== null && "suggestion" in body
      ? (body as { suggestion: unknown }).suggestion
      : null;
  return typeof raw === "string" ? normalizeSuggestion(partial, raw) : null;
}

function GhostFetchPlugin({ recentPrompts }: { recentPrompts: readonly string[] }) {
  const [editor] = useLexicalComposerContext();
  // Chat's empty-thread default is a new `[]` on every keystroke. Keep the
  // pause on the editor, and read the latest prompts only when the timer fires.
  const recentPromptsRef = useRef(recentPrompts);
  recentPromptsRef.current = recentPrompts;

  useEffect(() => {
    let timer: number | undefined;
    let request: AbortController | undefined;
    let lastText: string | null = null;

    const stop = editor.registerUpdateListener(({ editorState }) => {
      const snapshot = editorState.read(() => ({
        text: $draftText(),
        hasGhost: $nodesOfType(GhostNode).length > 0,
      }));
      if (snapshot.hasGhost || snapshot.text.trim().length === 0) {
        lastText = snapshot.text;
        return;
      }
      if (snapshot.text === lastText) {
        return;
      }
      lastText = snapshot.text;
      window.clearTimeout(timer);
      request?.abort();

      timer = window.setTimeout(() => {
        if (editor.getEditorState().read(() => $draftText()) !== snapshot.text) {
          return;
        }
        request = new AbortController();
        void fetchGhost(editor, snapshot.text, recentPromptsRef.current, request.signal);
      }, GHOST_PAUSE_MS);
    });

    return () => {
      stop();
      window.clearTimeout(timer);
      request?.abort();
    };
  }, [editor]);

  return null;
}

function fetchGhost(
  editor: LexicalEditor,
  partial: string,
  recentPrompts: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  return fetch(AUTOCOMPLETE_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ partialPrompt: partial, recentPrompts }),
    signal,
  })
    .then((response) => (response.ok ? response.json() : { suggestion: null }))
    .then((body: unknown) => {
      const suggestion = suggestionFromBody(partial, body);
      if (suggestion === null) {
        return;
      }
      editor.update(() => {
        if ($draftText() === partial) {
          $insertGhost(suggestion);
        }
      });
    })
    .catch(() => {
      // Network or abort: no ghost, compose still works.
    });
}
