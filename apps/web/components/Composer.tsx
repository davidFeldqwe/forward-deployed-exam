"use client";

import { useEffect, useLayoutEffect } from "react";
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
  onChange,
  recentPrompts,
  placeholder,
  maxLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  recentPrompts: readonly string[];
  placeholder: string;
  maxLength: number;
}) {
  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="relative min-h-9 min-w-0 flex-1">
        <label className="sr-only" htmlFor={id}>
          {placeholder}
        </label>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              id={id}
              aria-placeholder={placeholder}
              placeholder={
                <div className="pointer-events-none absolute inset-0 z-0 flex items-center px-3 text-base text-muted-foreground md:text-base">
                  {placeholder}
                </div>
              }
              data-slot="input-group-control"
              className="relative z-10 h-9 overflow-x-auto overflow-y-hidden px-3 py-1.5 text-base whitespace-nowrap outline-none md:text-base"
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <input type="hidden" name="prompt" value={value} />
      </div>
      <SyncDraftPlugin maxLength={maxLength} value={value} />
      <DraftChangePlugin maxLength={maxLength} onChange={onChange} />
      <GhostCompletePlugin recentPrompts={recentPrompts} />
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

function GhostCompletePlugin({ recentPrompts }: { recentPrompts: readonly string[] }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const removeGhostsOnInsert = editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      () => {
        $removeGhosts();
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const removeGhostsOnDelete = editor.registerCommand(
      DELETE_CHARACTER_COMMAND,
      () => {
        $removeGhosts();
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const removeGhostsOnPaste = editor.registerCommand(
      PASTE_COMMAND,
      () => {
        $removeGhosts();
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const acceptTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        const [ghost] = $nodesOfType(GhostNode);
        if (!$isGhostNode(ghost)) {
          return false;
        }
        event?.preventDefault();
        const text = $createTextNode(ghost.continuation());
        ghost.replace(text);
        text.selectEnd();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const dismissEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if ($nodesOfType(GhostNode).length === 0) {
          return false;
        }
        $removeGhosts();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const submitEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        event?.preventDefault();
        $removeGhosts();
        editor.getRootElement()?.closest("form")?.requestSubmit();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const form = editor.getRootElement()?.closest("form");
    const dismissOnSend = () => {
      editor.update(() => {
        $removeGhosts();
      });
    };
    form?.addEventListener("submit", dismissOnSend);

    return () => {
      removeGhostsOnInsert();
      removeGhostsOnDelete();
      removeGhostsOnPaste();
      acceptTab();
      dismissEscape();
      submitEnter();
      form?.removeEventListener("submit", dismissOnSend);
    };
  }, [editor]);

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
      request = undefined;

      timer = window.setTimeout(() => {
        const still = editor.getEditorState().read(() => $draftText());
        if (still !== snapshot.text) {
          return;
        }
        request = new AbortController();
        void fetch(AUTOCOMPLETE_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            partialPrompt: snapshot.text,
            recentPrompts,
          }),
          signal: request.signal,
        })
          .then((response) => (response.ok ? response.json() : { suggestion: null }))
          .then((body: unknown) => {
            const raw =
              typeof body === "object" && body !== null && "suggestion" in body
                ? (body as { suggestion: unknown }).suggestion
                : null;
            const suggestion = typeof raw === "string" ? normalizeSuggestion(snapshot.text, raw) : null;
            if (suggestion === null) {
              return;
            }
            editor.update(() => {
              if ($draftText() !== snapshot.text) {
                return;
              }
              $removeGhosts();
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.insertNodes([$createGhostNode(suggestion)]);
              } else {
                const last = $getRoot().getLastChild();
                last?.selectEnd();
                const next = $getSelection();
                if ($isRangeSelection(next)) {
                  next.insertNodes([$createGhostNode(suggestion)]);
                }
              }
            });
          })
          .catch(() => {
            // Network or abort: no ghost, compose still works.
          });
      }, GHOST_PAUSE_MS);
    });

    return () => {
      stop();
      window.clearTimeout(timer);
      request?.abort();
    };
  }, [editor, recentPrompts]);

  return null;
}
