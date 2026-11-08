"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, LoaderCircle, Mic, Square, X } from "lucide-react";
import { TranslationResult } from "@/components/translation-result";
import type { RecorderState } from "@/components/use-recorder";
import { getTutorVoice } from "@/lib/tutor-voices";
import { translationExamples, type TranslationExampleCategory } from "@/lib/translation-examples";
import type { TranslationVoice } from "@/lib/translation-voice";
import { languages, MAX_TEXT_LENGTH, speechTextError, type LanguageId, type TranslationReply, type TutorId } from "@/lib/types";

export type TranslateWorkspaceProps = {
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
  tutor: TutorId;
  voice: TranslationVoice;
  onVoiceChange: (voice: TranslationVoice) => void;
  cloneReady: boolean;
  sourceText: string;
  onSourceTextChange: (value: string) => void;
  onExampleSelect: (text: string) => void;
  onSourceLanguageChange: (language: LanguageId) => void;
  onTargetLanguageChange: (language: LanguageId) => void;
  onTranslate: () => void;
  onToggleRecording: () => void;
  onCancel: () => void;
  translation: TranslationReply | null;
  busy: boolean;
  recorderState: RecorderState;
  disabled: boolean;
  speechReady: boolean;
  active: boolean;
  audioState: "idle" | "loading" | "playing";
  onListen: (text: string, language: LanguageId) => void;
  onStop: () => void;
};

const exampleCategories: Array<{ id: TranslationExampleCategory; label: string }> = [
  { id: "expressive", label: "Expressive" },
  { id: "pairings", label: "Pairings" },
  { id: "directions", label: "Directions" },
];

function TranslationExamples({ language, disabled, onSelect }: {
  language: LanguageId;
  disabled: boolean;
  onSelect: (text: string) => void;
}) {
  const [category, setCategory] = useState<TranslationExampleCategory>("expressive");
  const [page, setPage] = useState(0);
  const examples = translationExamples[language].filter((example) => example.category === category);
  const pageCount = Math.ceil(examples.length / 2);
  const start = Math.min(page * 2, Math.max(0, examples.length - 2));
  const visible = examples.slice(start, start + 2);

  return <section className="tw-examples" aria-label="Translation examples">
    <div className="tw-examples-heading"><h2>Try an example</h2><span>Choose to translate</span></div>
    <div className="tw-example-categories" role="group" aria-label="Example categories">
      {exampleCategories.map((item) => <button type="button" key={item.id}
        aria-pressed={category === item.id} disabled={disabled}
        onClick={() => { setCategory(item.id); setPage(0); }}>{item.label}</button>)}
    </div>
    <div className="tw-examples-grid">
      {visible.map((example) => <button type="button" className="tw-example" key={example.id}
        disabled={disabled} onClick={() => onSelect(example.text)}>
        <span className="tw-example-label">{example.label}<ArrowRight size={13} aria-hidden="true" /></span>
        <span className="tw-example-text" lang={language} dir="auto">
          {example.text.split(/(\[[^\]\r\n]+\])/g).map((part, index) => index % 2
            ? <span className="emotion-token" data-emotion={part.slice(1, -1).trim().toLowerCase()} key={index}>{part}</span>
            : part)}
        </span>
      </button>)}
    </div>
    {pageCount > 1 && <div className="tw-examples-pagination">
      <span aria-live="polite" aria-atomic="true">{page + 1} of {pageCount}</span>
      <button type="button" disabled={disabled} onClick={() => setPage((current) => (current + 1) % pageCount)}>
        More examples<ArrowRight size={12} aria-hidden="true" />
      </button>
    </div>}
  </section>;
}

export function TranslateWorkspace({ sourceLanguage, targetLanguage, tutor, voice, onVoiceChange, cloneReady, sourceText,
  onSourceTextChange, onExampleSelect, onSourceLanguageChange, onTargetLanguageChange, onTranslate, onToggleRecording,
  onCancel, translation, busy, recorderState, disabled, speechReady, active, audioState, onListen, onStop,
}: TranslateWorkspaceProps) {
  const id = useId();
  const sourceInput = useRef<HTMLTextAreaElement>(null);
  const sourceHighlight = useRef<HTMLDivElement>(null);
  const syncSourceScroll = () => {
    if (sourceInput.current && sourceHighlight.current) {
      sourceHighlight.current.scrollTop = sourceInput.current.scrollTop;
      sourceHighlight.current.scrollLeft = sourceInput.current.scrollLeft;
    }
  };
  useLayoutEffect(syncSourceScroll, [sourceText]);
  const recording = recorderState === "recording";
  const starting = recorderState === "starting";
  const transcribing = recorderState === "transcribing";
  const working = busy || recorderState !== "idle";
  const validation = speechTextError(sourceText);
  const canTranslate = !disabled && !working && !validation;
  const microphoneDisabled = !recording && (disabled || !speechReady || working);
  const sourceName = languages.find((item) => item.id === sourceLanguage)!.name;

  function submit() {
    if (!canTranslate) return;
    onStop();
    onTranslate();
  }

  return <section className="translate-workspace" aria-label="Translate and listen">
    <form className="tw-panel tw-source" aria-label="Text to translate" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="tw-panel-header">
        <label className="tw-language" htmlFor={id + "-source-language"}>
          <span>From</span>
          <div className="tw-select-wrap"><select id={id + "-source-language"} aria-label="Source language"
            value={sourceLanguage} disabled={working}
            onChange={(event) => { onStop(); onSourceLanguageChange(event.target.value as LanguageId); }}>
            {languages.map((language) => <option key={language.id} value={language.id}>{language.flag} {language.name}</option>)}
          </select><ChevronDown size={14} aria-hidden="true" /></div>
        </label>
      </div>

      <label className="sr-only" htmlFor={id + "-source-text"}>Text to translate</label>
      <div className="tw-source-editor">
      <div ref={sourceHighlight} className="tw-source-highlight" lang={sourceLanguage} dir="auto" aria-hidden="true">
        {sourceText.split(/(\[[^\]\r\n]+\])/g).map((part, index) => index % 2
          ? <span className="emotion-token" data-emotion={part.slice(1, -1).trim().toLowerCase()} key={index}>{part}</span>
          : part)}{sourceText.endsWith("\n") ? "\n" : ""}
      </div>
      <textarea ref={sourceInput} id={id + "-source-text"} className="tw-source-text" lang={sourceLanguage} dir="auto"
        value={sourceText} maxLength={MAX_TEXT_LENGTH} disabled={working}
        onScroll={syncSourceScroll}
        aria-describedby={id + "-input-hint" + (sourceText && validation ? " " + id + "-input-error" : "")}
        aria-invalid={!!sourceText && !!validation} placeholder="Type or speak something to translate…"
        onChange={(event) => { onStop(); onSourceTextChange(event.target.value); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }} />
      </div>

      <TranslationExamples key={sourceLanguage} language={sourceLanguage} disabled={working || disabled}
        onSelect={(text) => { onStop(); onExampleSelect(text); }} />

      <div className="tw-source-footer">
        {sourceText && validation && <p id={id + "-input-error"} className="field-error" role="alert">{validation}</p>}
        <p id={id + "-input-hint"} className="tw-input-hint" role={working ? "status" : undefined}>
          {recording ? `Listening in ${sourceName}. Stop to translate.` : starting ? "Opening your microphone…"
            : transcribing ? "Transcribing your speech…" : busy ? "Translating…" : "Enter to translate · Shift+Enter for a new line"}
        </p>
        <div className="tw-source-actions">
          <button type="button" className={"tw-dictate" + (recording ? " recording" : "")}
            disabled={microphoneDisabled} onClick={() => { onStop(); onToggleRecording(); }}>
            {recording ? <Square size={14} fill="currentColor" /> : starting || transcribing ? <LoaderCircle size={16} className="spin" /> : <Mic size={17} />}
            {recording ? "Stop & translate" : "Speak"}
          </button>
          <div className="tw-submit-actions">
            {working && <button type="button" className="tw-cancel" onClick={onCancel}><X size={14} />Cancel</button>}
            <button type="submit" className="primary-button tw-translate" disabled={!canTranslate}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={17} />}{busy ? "Translating" : "Translate"}
            </button>
          </div>
        </div>
      </div>
    </form>

    <section className="tw-panel tw-target" aria-label="Translated text">
      <div className="tw-panel-header tw-target-header">
        <label className="tw-language" htmlFor={id + "-target-language"}>
          <span>To</span>
          <div className="tw-select-wrap"><select id={id + "-target-language"} aria-label="Target language"
            value={targetLanguage} disabled={working}
            onChange={(event) => { onStop(); onTargetLanguageChange(event.target.value as LanguageId); }}>
            {languages.map((language) => <option key={language.id} value={language.id}>
              {language.flag} {language.name}
            </option>)}
          </select><ChevronDown size={14} aria-hidden="true" /></div>
        </label>
        <label className="tw-language tw-voice" htmlFor={id + "-voice"}>
          <span>Voice</span>
          <div className="tw-select-wrap"><select id={id + "-voice"} aria-label="Translation voice"
            value={voice} disabled={working}
            onChange={(event) => { onStop(); onVoiceChange(event.target.value as TranslationVoice); }}>
            <option value="language">{getTutorVoice(targetLanguage, tutor).name} · Language matched</option>
            {cloneReady && <option value="personal">My cloned voice · English source</option>}
          </select><ChevronDown size={14} aria-hidden="true" /></div>
        </label>
      </div>
      <div className="tw-output" aria-busy={busy}>
        {translation ? <TranslationResult reply={translation} language={targetLanguage} tutor={tutor}
          active={active} audioState={audioState} disabled={disabled || !speechReady || working}
          onListen={onListen} onStop={onStop} />
          : <p className="tw-placeholder" role={busy ? "status" : undefined}>
            {busy && <LoaderCircle size={18} className="spin" aria-hidden="true" />}{busy ? "Translating…" : "Translation appears here"}
          </p>}
      </div>
    </section>
  </section>;
}
