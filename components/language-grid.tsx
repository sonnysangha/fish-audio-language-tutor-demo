"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { languages, type LanguageId } from "@/lib/types";

export type LanguageGridProps = {
  value: LanguageId;
  onChange: (language: LanguageId) => void;
  disabled?: boolean;
  "aria-labelledby"?: string;
};

export function LanguageGrid({ value, onChange, disabled = false, "aria-labelledby": labelledBy }: LanguageGridProps) {
  const id = useId();
  return <fieldset className="language-grid" role="radiogroup" disabled={disabled} aria-labelledby={labelledBy}>
    {!labelledBy && <legend className="sr-only">Choose your language</legend>}
    {languages.map((language) => <label key={language.id}
      className={"language-choice" + (value === language.id ? " selected" : "")}>
      <input type="radio" name={id} value={language.id} checked={value === language.id}
        aria-label={language.name} onChange={() => onChange(language.id)} />
      <span className="language-choice-flag" aria-hidden="true">{language.flag}</span>
      <span className="language-choice-copy"><strong>{language.name}</strong><small lang={language.id} dir="auto">{language.native}</small></span>
      <Check className="language-choice-check" size={14} aria-hidden="true" />
    </label>)}
  </fieldset>;
}
