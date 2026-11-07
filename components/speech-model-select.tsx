"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { selectableSpeechModels, speechModels, type SpeechModelId } from "@/lib/speech-models";

const descriptions: Record<SpeechModelId, string> = {
  "s2.1-pro-free": "Free until 30 Nov 2026",
  "drama-3": "Voice direction",
  "s2.1-pro": "Free standalone TTS until 30 Nov 2026; Fish Agent usage is paid",
  "s2-pro": "Previous generation",
};

function displayLabel(model: (typeof speechModels)[number]) {
  return model.id === "s2.1-pro" || model.id === "s2.1-pro-free" ? "S2.1 Pro" : model.label;
}

const isS21 = (model: (typeof speechModels)[number]) => model.id === "s2.1-pro" || model.id === "s2.1-pro-free";

export function SpeechModelSelect({ value, disabled = false, allowedModels, onChange }: {
  value: SpeechModelId;
  disabled?: boolean;
  allowedModels?: readonly SpeechModelId[];
  onChange: (id: SpeechModelId) => void;
}) {
  const id = useId();
  const availableModels = selectableSpeechModels(allowedModels);
  const selectedIndex = Math.max(0, availableModels.findIndex((model) => model.id === value));
  // Keep the actual active backend accurately labelled during a mode change;
  // the parent normalizes a paid S2.1 selection to the free ID for normal TTS.
  const selected = speechModels.find((model) => model.id === value) ?? availableModels[selectedIndex] ?? speechModels[0];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLDivElement>(null);
  const options = useRef<Array<HTMLDivElement | null>>([]);
  const listboxId = id + "-options";
  const captionId = id + "-caption";

  // A newly disabled control must not reopen when it becomes available again.
  if (disabled && open) setOpen(false);

  useEffect(() => {
    if (!open) return;
    listbox.current?.focus({ preventScroll: true });
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => document.removeEventListener("pointerdown", dismissOutside, true);
  }, [open]);

  useEffect(() => {
    if (open) options.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function openMenu(index = selectedIndex) {
    if (disabled) return;
    setActiveIndex(index);
    setOpen(true);
  }

  function closeMenu(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  function select(index: number) {
    if (disabled) return;
    closeMenu(true);
    const next = availableModels[index]?.id;
    if (!next) return;
    if (next !== value) onChange(next);
  }

  function handleTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      openMenu(event.key === "Home" ? 0 : availableModels.length - 1);
    }
  }

  function handleListKey(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + availableModels.length) % availableModels.length);
        break;
      case "Home":
      case "End":
        event.preventDefault();
        setActiveIndex(event.key === "Home" ? 0 : availableModels.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        break;
      case "Tab":
        // Let the normal Tab action continue from the trigger, after closing
        // the popup, so focus moves to the adjacent header control.
        closeMenu(true);
        break;
    }
  }

  return <div ref={root} className={"sms" + (open ? " sms-open" : "")}>
    <span id={captionId} className="sms-caption">Voice model</span>
    <div className="sms-control">
    <button ref={trigger} type="button" className="sms-trigger" disabled={disabled}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId}
      aria-label={"Voice model: " + displayLabel(selected) + ", " + descriptions[selected.id]}
      title={descriptions[selected.id]} onKeyDown={handleTriggerKey}
      onClick={() => open ? closeMenu(false) : openMenu()}>
      <span className="sms-selected-label">{displayLabel(selected)}</span>
      <span className={"sms-badge sms-badge-" + (isS21(selected) ? "free" : "paid")}>{isS21(selected) ? "Free TTS" : "Paid"}</span>
      <ChevronDown className="sms-chevron" size={14} aria-hidden="true" />
    </button>
    </div>
    {open && <div className="sms-popover">
      <div ref={listbox} id={listboxId} className="sms-listbox" role="listbox" tabIndex={-1}
        aria-labelledby={captionId} aria-activedescendant={id + "-option-" + activeIndex}
        onKeyDown={handleListKey}>
        {availableModels.map((model, index) => <div key={model.id} id={id + "-option-" + index}
          ref={(element) => { options.current[index] = element; }} role="option" aria-selected={model.id === value}
          className={"sms-option" + (activeIndex === index ? " sms-option-active" : "") + (model.id === value ? " sms-option-selected" : "")}
          onPointerMove={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => select(index)}>
          <div className="sms-option-main">
            <div className="sms-option-copy">
              <span className="sms-option-label">{displayLabel(model)}</span>
              <span className="sms-option-description">{descriptions[model.id]}</span>
            </div>
            <span className={"sms-badge sms-badge-" + (isS21(model) ? "free" : "paid")}>{isS21(model) ? "Free TTS" : "Paid"}</span>
          </div>
          <span className="sms-check" aria-hidden="true">{model.id === value && <Check size={15} />}</span>
        </div>)}
      </div>
    </div>}
  </div>;
}
