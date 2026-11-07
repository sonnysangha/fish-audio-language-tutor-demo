"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { voiceCueCategories, voiceCues, type VoiceCueCategory } from "@/lib/voice-cues";

export function CuePicker({ onInsert, disabled = false }: { onInsert: (tag: string) => void; disabled?: boolean }) {
  const [category, setCategory] = useState<VoiceCueCategory>("emotions");
  const id = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % voiceCueCategories.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + voiceCueCategories.length) % voiceCueCategories.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = voiceCueCategories.length - 1;
    else return;
    event.preventDefault();
    if (disabled) return;
    setCategory(voiceCueCategories[next].id);
    tabs.current[next]?.focus();
  }

  return <div className="cue-picker">
    <div className="cue-category-tabs" role="tablist" aria-label="Voice cue categories">
      {voiceCueCategories.map((item, index) => <button key={item.id} ref={(element) => { tabs.current[index] = element; }}
        type="button" role="tab" id={id + "-tab-" + item.id} aria-selected={category === item.id}
        aria-controls={id + "-panel"} tabIndex={category === item.id ? 0 : -1} disabled={disabled}
        onMouseDown={(event) => event.preventDefault()} onKeyDown={(event) => navigate(event, index)}
        onClick={() => setCategory(item.id)}>{item.label}</button>)}
    </div>
    <div id={id + "-panel"} className="cue-buttons" role="tabpanel" aria-labelledby={id + "-tab-" + category}>
      {voiceCues.filter((cue) => cue.category === category).map((cue) => <button key={cue.id} type="button"
        title={cue.tag} aria-label={"Insert " + cue.label + ": " + cue.tag} disabled={disabled}
        onMouseDown={(event) => event.preventDefault()} onClick={() => onInsert(cue.tag)}>{cue.label}</button>)}
    </div>
  </div>;
}
