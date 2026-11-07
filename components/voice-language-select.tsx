"use client";

import { ChevronDown } from "lucide-react";
import { languages, type LanguageId, type TutorId } from "@/lib/types";
import { getTutorVoice } from "@/lib/tutor-voices";

export function VoiceLanguageSelect({ language, tutor, onChange, disabled, pendingLanguage, label, caption = "Voice language" }: {
  language: LanguageId;
  tutor: TutorId;
  onChange: (language: LanguageId) => void;
  disabled?: boolean;
  pendingLanguage?: LanguageId | null;
  label: string;
  caption?: string;
}) {
  return <label className="voice-language-select">
    <span>{caption}</span>
    <div><select aria-label={label} value={pendingLanguage ?? language} disabled={disabled}
      aria-busy={!!pendingLanguage} onChange={(event) => onChange(event.target.value as LanguageId)}>
      {languages.map((item) => {
        const voice = getTutorVoice(item.id, tutor);
        const region = ({ "ar-SA": "Saudi", "es-ES": "Spain", "pt-BR": "Brazil", "fr-FR": "France" } as Record<string, string>)[voice.locale];
        return <option key={item.id} value={item.id}>
          {item.name}{region ? ` (${region})` : ""} · {voice.name}
        </option>;
      })}
    </select><ChevronDown size={12} /></div>
  </label>;
}
