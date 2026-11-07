"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, Square, Volume2 } from "lucide-react";
import { type LanguageId, type TutorId, type TutorReply, speechTextError } from "@/lib/types";
import { TutorPortrait } from "@/components/chat-avatar";
import { SpeechResponse } from "@/components/speech-response";
import { useCardLanguage } from "@/components/use-card-language";

const leaveAudioAlone = () => {};

export function TutorMessage({ reply, language, targetLanguage, tutor, active, audioState, disabled, onListen, onStop }: {
  reply: TutorReply; language: LanguageId; targetLanguage: LanguageId; tutor: TutorId;
  active: boolean; audioState: "idle" | "loading" | "playing"; disabled: boolean;
  onListen: (text: string, language: LanguageId) => void; onStop: () => void;
}) {
  // The shared selector stops playback. Automatic historical-card updates must
  // not stop the freshly generated tutor response that the parent is playing.
  const card = useCardLanguage({ text: reply.text, speechText: reply.speechText, meaning: reply.translation, pronunciation: reply.pronunciation }, language, leaveAudioAlone);
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null);
  const key = card.language + card.content.speechText;
  const spokenText = edit?.key === key ? edit.value : card.content.speechText;
  const sourceKey = JSON.stringify([language, reply.text, reply.speechText, reply.translation, reply.pronunciation]);
  const current = useRef({ language: card.language, pendingLanguage: card.pendingLanguage, spokenText });
  useLayoutEffect(() => {
    current.current = { language: card.language, pendingLanguage: card.pendingLanguage, spokenText };
  });
  const changeLanguage = card.changeLanguage;
  useEffect(() => {
    const value = current.current;
    if (value.language !== targetLanguage || value.pendingLanguage !== null)
      void changeLanguage(targetLanguage, value.spokenText);
    // Only a new source or a new selection starts automatic work. A failed
    // request remains an explicit retry instead of starting a render loop.
  }, [sourceKey, targetLanguage, changeLanguage]);
  const matchesTarget = card.language === targetLanguage;
  return <div className="chat-row tutor-row">
    <figure className="speaker-avatar"><TutorPortrait tutor={tutor} small /><figcaption>{tutor === "maya" ? "Maya" : "Leo"}</figcaption></figure>
    <article className="message tutor-message">
      <fieldset className="speech-fields" disabled={card.translating}>
        <SpeechResponse language={card.language} value={spokenText} original={card.content.speechText}
          onChange={(value) => { onStop(); setEdit({ key, value }); }} />
      </fieldset>
      <p className="message-translation" lang="en">{card.content.meaning}</p>
      <div className="bubble-footer">
        <details className="pronunciation-detail"><summary>Pronunciation<ChevronDown size={13} /></summary><p>{card.content.pronunciation}</p></details>
        <button className="audio-button" disabled={disabled || card.translating || !matchesTarget || !!card.error || !!speechTextError(spokenText)}
          aria-label={active ? "Stop tutor audio" : "Listen to tutor reply"} onClick={() => onListen(spokenText, card.language)}>
          {active && audioState === "loading" ? <LoaderCircle size={23} className="spin" /> : active ? <Square size={20} /> : <Volume2 size={24} />}<span>{active ? "Stop" : "Listen"}</span>
        </button>
      </div>
      {(card.translating || (!matchesTarget && !card.error)) && <p className="card-status" role="status">Translating this reply…</p>}
      {card.error && <div className="field-error" role="alert"><p>{card.error}</p><button type="button" disabled={disabled}
        onClick={() => void changeLanguage(targetLanguage, spokenText)}>Retry translation</button></div>}
    </article>
  </div>;
}
