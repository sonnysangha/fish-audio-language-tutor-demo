"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { MAX_TEXT_LENGTH, speechTextError } from "@/lib/types";
import { insertVoiceCue } from "@/lib/voice-cues";
import { CuePicker } from "@/components/cue-picker";

export function VoiceEditor({ value, original, onChange, label = "Words & emotion" }: {
  value: string;
  original: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const id = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const error = speechTextError(value);

  useLayoutEffect(() => {
    const field = editor.current;
    if (!field) return;
    const fitText = () => {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
    };
    fitText();
    let width = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (nextWidth !== width) {
        width = nextWidth;
        fitText();
      }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [value]);

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
    <div className="voice-editor">
      <div className="voice-editor-content">
        <div className="editor-label">
          <label htmlFor={id}>{label}</label>
          <button type="button" onClick={() => onChange(original)}><RotateCcw size={12} />Reset</button>
        </div>
        <textarea ref={editor} id={id} className="voice-main-text" value={value} dir="auto" rows={1}
          style={{ overflow: "hidden", resize: "none" }}
          maxLength={MAX_TEXT_LENGTH} aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          onChange={(event) => onChange(event.target.value)} />
        <CuePicker onInsert={insertCue} />
        <p id={id + "-help"} className="editor-help">Place your cursor, then add a cue. You can also type your own direction in [brackets].</p>
        {error && <p id={id + "-error"} className="field-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
