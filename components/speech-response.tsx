"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { MAX_TEXT_LENGTH, speechTextError, type LanguageId } from "@/lib/types";
import { insertVoiceCue } from "@/lib/voice-cues";
import { CuePicker } from "@/components/cue-picker";

export function SpeechResponse({ value, original, onChange, language, showCueButtons = true }: {
  value: string;
  original: string;
  onChange: (value: string) => void;
  language: LanguageId;
  showCueButtons?: boolean;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editToggle = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);
  const error = speechTextError(value);

  useLayoutEffect(() => {
    const field = editor.current;
    if (!editing || !field) return;
    const fitText = () => {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
    };
    fitText();
    let width = field.getBoundingClientRect().width;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (nextWidth !== width) {
        width = nextWidth;
        fitText();
      }
    });
    observer?.observe(field);
    window.addEventListener("resize", fitText);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fitText);
    };
  }, [editing, value]);

  useLayoutEffect(() => {
    if (!editing) {
      if (restoreEditFocus.current) {
        editToggle.current?.focus();
        restoreEditFocus.current = false;
      }
      return;
    }
    const field = editor.current;
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }, [editing]);

  function insertCue(tag: string) {
    const field = editor.current;
    const start = field?.selectionStart ?? value.length;
    const end = field?.selectionEnd ?? start;
    const inserted = insertVoiceCue(value, tag, start, end, MAX_TEXT_LENGTH);
    if (!inserted) return;
    onChange(inserted.text);
    requestAnimationFrame(() => {
      if (!field?.isConnected) return;
      field.focus();
      field.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  }

  return (
    <div className="speech-response">
      {editing ? (
        <div className="speech-response-editor">
          <label htmlFor={id} className="sr-only">Edit words and emotion</label>
          <textarea ref={editor} id={id} value={value} lang={language} dir="auto" rows={1}
            maxLength={MAX_TEXT_LENGTH} aria-invalid={!!error}
            aria-describedby={[showCueButtons ? id + "-help" : "", error ? id + "-error" : ""].filter(Boolean).join(" ") || undefined}
            style={{ overflow: "hidden", resize: "none" }}
            onChange={(event) => onChange(event.target.value)} />
          {showCueButtons && <>
            <CuePicker onInsert={insertCue} />
            <p id={id + "-help"} className="editor-help">Place your cursor, then add a cue. You can also type your own direction in [brackets].</p>
          </>}
          <div className="speech-edit-actions">
            <button type="button" onClick={() => onChange(original)}><RotateCcw size={13} />Reset</button>
            <button type="button" disabled={!!error} onClick={() => {
              if (!error) {
                restoreEditFocus.current = true;
                setEditing(false);
              }
            }}>Done</button>
          </div>
        </div>
      ) : (
        <>
          <p className="spoken-response" lang={language} dir="auto">
            {value.split(/(\[[^\]\r\n]+\])/g).map((part, index) => index % 2
              ? <span className="emotion-token" data-emotion={part.slice(1, -1).trim().toLowerCase()} key={index}>{part}</span>
              : part)}
          </p>
          <button ref={editToggle} type="button" className="speech-edit-toggle" aria-label="Edit words and emotion"
            title="Edit words and emotion" onClick={() => setEditing(true)}><Pencil size={14} /></button>
        </>
      )}
      {error && <p id={id + "-error"} className="field-error" role="alert">{error}</p>}
    </div>
  );
}
