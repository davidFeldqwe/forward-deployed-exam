"use client";

import { useState } from "react";

import { chatCopy } from "@/app/chat-copy";

export function Chat() {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const ready = draft.trim().length > 0;

  return (
    <div className="chat">
      <header className="chat-header">
        <div className="chat-header-inner">
          <div className="wordmark">
            <span className="wordmark-mark" aria-hidden="true" />
            <span className="wordmark-name">{chatCopy.wordmark}</span>
          </div>
          <span className="chat-window">{chatCopy.comparisonWindow}</span>
        </div>
      </header>

      <div className="chat-transcript" aria-label="Transcript">
        <div className="chat-column">
          <ul className="chat-chips">
            {chatCopy.chips.map((question) => (
              <li key={question}>
                <button
                  type="button"
                  className="chat-chip"
                  onClick={() => setDraft(question)}
                >
                  <span>{question}</span>
                  <span className="question-arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="chat-composer">
        <div className="chat-column chat-composer-inner">
          <form
            className={focused ? "chat-send-field chat-send-field-focus" : "chat-send-field"}
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="visually-hidden" htmlFor="chat-draft">
              {chatCopy.composerPlaceholder}
            </label>
            <input
              id="chat-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={chatCopy.composerPlaceholder}
            />
            <button
              type="submit"
              className={ready ? "chat-send chat-send-ready" : "chat-send"}
            >
              {chatCopy.sendLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
