"use client";

import { useState } from "react";
import { ChevronDown, LoaderCircle, Square, Volume2 } from "lucide-react";
import { speechTextError, type LanguageId, type TranslationReply, type TutorId } from "@/lib/types";
import { SpeechResponse } from "@/components/speech-response";

export function TranslationResult({ reply, language, active, audioState, disabled, onListen, onStop }: {
  reply: TranslationReply; language: LanguageId; tutor: TutorId;
  active: boolean; audioState: "idle" | "loading" | "playing"; disabled: boolean;
  onListen: (text: string, language: LanguageId) => void; onStop: () => void;
}) {
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null);
  const key = JSON.stringify([language, reply.speechText]);
  const spokenText = edit?.key === key ? edit.value : reply.speechText;
  return <div className="translation-result">
    <fieldset className="speech-fields" lang={language}>
      <SpeechResponse value={spokenText} original={reply.speechText} language={language} showCueButtons
        onChange={(value) => { onStop(); setEdit({ key, value }); }} />
    </fieldset>
    {reply.meaning.trim() !== reply.text.trim() && <p className="translation-meaning" lang="en">{reply.meaning}</p>}
    <details className="pronunciation-detail translation-pronunciation-detail">
      <summary>Pronunciation<ChevronDown size={13} /></summary><p>{reply.pronunciation}</p>
    </details>
    {reply.note && <p className="language-note">{reply.note}</p>}
    <div className="card-audio-action translation-result-actions">
      <button type="button" className="audio-button" disabled={disabled || !!speechTextError(spokenText)}
        aria-label={active ? "Stop translation audio" : "Listen to translation"} onClick={() => onListen(spokenText, language)}>
        {active && audioState === "loading" ? <LoaderCircle size={23} className="spin" /> : active ? <Square size={20} /> : <Volume2 size={24} />}<span>{active ? "Stop" : "Listen"}</span>
      </button>
    </div>
  </div>;
}
