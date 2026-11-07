"use client";

import { Check, ChevronDown, LoaderCircle, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LanguageId, ReplyOption, TutorId } from "@/lib/types";
import type { RecorderState } from "@/components/use-recorder";
import { useCardLanguage } from "@/components/use-card-language";

const leaveAudioAlone = () => {};

type ReplyOptionsProps = {
  options: ReplyOption[];
  language: LanguageId;
  targetLanguage: LanguageId;
  tutor: TutorId;
  recorderState: RecorderState;
  selectedIndex: number | null;
  chooseDisabled?: boolean;
  onChoose: (option: ReplyOption, index: number, language: LanguageId) => void;
  playingIndex: number | null;
  audioState: "idle" | "loading" | "playing";
  audioDisabled: boolean;
  onListen: (option: ReplyOption, index: number, language: LanguageId) => void;
  onStop: () => void;
  onTranslationPendingChange: (pending: boolean) => void;
};

function ReplyOptionCard({ option, index, language, targetLanguage, recorderState, selectedIndex, chooseDisabled = false, onChoose, playingIndex, audioState, audioDisabled, onListen, onPendingChange }: Omit<ReplyOptionsProps, "options" | "onTranslationPendingChange"> & {
  option: ReplyOption;
  index: number;
  onPendingChange: (index: number, pending: boolean) => void;
}) {
  // The shared selector stops playback when needed. Automatic suggestion
  // translation must not interrupt the parent's newly generated Read Aloud.
  const card = useCardLanguage({ ...option, speechText: option.text }, language, leaveAudioAlone);
  const { changeLanguage, language: displayedLanguage, pendingLanguage } = card;
  const attempted = useRef<string | null>(null);
  const requestKey = JSON.stringify([language, option.text, option.meaning, option.pronunciation, targetLanguage]);
  useEffect(() => () => { attempted.current = null; }, []);
  useEffect(() => {
    // One attempt per source and selected language. State changes after an
    // unsuccessful request must not silently trigger another billable request.
    if (attempted.current === requestKey) return;
    attempted.current = requestKey;
    if (displayedLanguage !== targetLanguage || (pendingLanguage !== null && pendingLanguage !== targetLanguage)) {
      void changeLanguage(targetLanguage);
    }
  }, [requestKey, targetLanguage, displayedLanguage, pendingLanguage, changeLanguage]);
  const languageMismatch = displayedLanguage !== targetLanguage;
  const translationPending = card.translating || (languageMismatch && !card.error);
  useEffect(() => {
    onPendingChange(index, translationPending);
    return () => onPendingChange(index, false);
  }, [index, translationPending, onPendingChange]);
  const { content } = card;
  const active = playingIndex === index && audioState !== "idle";
  const translatedOption = { text: content.text, meaning: content.meaning, pronunciation: content.pronunciation };

  return <article className={"reply-option " + (selectedIndex === index ? "selected" : "")} aria-busy={translationPending}>
    <button type="button" className="choose-option"
      aria-pressed={selectedIndex === index} disabled={chooseDisabled || recorderState === "transcribing" || card.translating || languageMismatch}
      aria-label={"Choose reply " + (index + 1) + ": " + content.text}
      onClick={() => onChoose(translatedOption, index, card.language)}>
      {selectedIndex === index && <Check className="option-selected-check" size={14} aria-hidden="true" />}
      <span className="option-text" lang={card.language} dir="auto">{content.text}</span>
      <span className="option-meaning">{content.meaning}</span>
    </button>
    <div className="option-utilities">
      <details className="pronunciation-detail"><summary>Pronunciation<ChevronDown size={12} /></summary><p>{content.pronunciation}</p></details>
      <button type="button" className="audio-button" disabled={audioDisabled || card.translating || languageMismatch}
        aria-label={active ? "Stop reply option " + (index + 1) : "Listen to reply option " + (index + 1)}
        title={active ? "Stop" : "Listen"}
        onClick={() => onListen({ ...translatedOption, text: content.speechText }, index, card.language)}>
        {active && audioState === "loading" ? <LoaderCircle size={22} className="spin" /> : active ? <Square size={18} /> : <Volume2 size={22} />}
      </button>
    </div>
    {translationPending && <p className="card-status" role="status">Translating this reply…</p>}
    {card.error && <div className="field-error" role="alert"><p>{card.error}</p>
      <button type="button" disabled={audioDisabled || chooseDisabled || recorderState !== "idle" || card.translating}
        aria-label={"Retry translation for reply option " + (index + 1)}
        onClick={() => void changeLanguage(targetLanguage)}>Retry translation</button>
    </div>}
  </article>;
}

export function ReplyOptions({ options, onTranslationPendingChange, ...props }: ReplyOptionsProps) {
  const { recorderState } = props;
  const [pendingCards, setPendingCards] = useState<ReadonlySet<number>>(() => new Set());
  const onPendingChange = useCallback((index: number, pending: boolean) => {
    setPendingCards((current) => {
      if (current.has(index) === pending) return current;
      const next = new Set(current);
      if (pending) next.add(index);
      else next.delete(index);
      return next;
    });
  }, []);
  const translating = pendingCards.size > 0;
  useEffect(() => {
    onTranslationPendingChange(translating);
  }, [translating, onTranslationPendingChange]);
  useEffect(() => () => onTranslationPendingChange(false), [onTranslationPendingChange]);
  return (
    <section className={"reply-options " + (recorderState === "recording" ? "listening" : "")} aria-label="Things you can say">
      <div className="reply-options-heading">
        <p>{recorderState === "recording" ? "Read one aloud, or use your own words." : "Choose a reply, or write your own."}</p>
      </div>
      <div className="reply-options-grid">
        {options.map((option, index) => <ReplyOptionCard key={index} {...props} option={option} index={index} onPendingChange={onPendingChange} />)}
      </div>
    </section>
  );
}
