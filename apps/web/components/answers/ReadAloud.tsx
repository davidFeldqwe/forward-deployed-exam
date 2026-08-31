"use client";

import { Volume2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { readAloud } from "@/app/read-aloud";
import { Button } from "@/components/ui/button";

/**
 * Read aloud (issue #28; PRD stories 36-37). The browser's own `speechSynthesis`
 * says the prose it is handed and nothing else: there is no vendor, no key and
 * no route behind this control, and the numbers stay on screen rather than being
 * narrated out of the columns that explain them.
 */
export function ReadAloud({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  // Asked after mount: the server has no speech API to ask, and a browser
  // without one should show no control rather than a button that does nothing.
  const [available, setAvailable] = useState(false);
  useEffect(() => setAvailable("speechSynthesis" in window), []);

  // Leaving the thread — or this answer ceasing to be the last one with prose —
  // stops the voice, so speech never outlives the control that started it.
  useEffect(() => {
    if (!speaking) {
      return;
    }
    return () => window.speechSynthesis.cancel();
  }, [speaking]);

  if (!available) {
    return null;
  }

  function toggle() {
    const speech = window.speechSynthesis;
    // Anything already queued goes first, so a second press restarts this prose
    // rather than stacking a second voice behind it.
    speech.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    speech.speak(utterance);
    setSpeaking(true);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        // The transcript is inside the composer's form: without this the control
        // would send the draft question instead of speaking.
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-pressed={speaking}
        className="h-7 gap-1.5 px-2 text-[11.5px] text-muted-foreground"
      >
        <Volume2Icon aria-hidden="true" />
        {speaking ? readAloud.stopLabel : readAloud.label}
      </Button>
      <span className="text-[11px] text-muted-foreground/70">{readAloud.note}</span>
    </div>
  );
}
