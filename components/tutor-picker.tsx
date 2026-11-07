"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { TutorPortrait } from "@/components/chat-avatar";
import type { TutorId } from "@/lib/types";

const tutors: { id: TutorId; name: string; description: string }[] = [
  { id: "maya", name: "Maya", description: "Warm & encouraging" },
  { id: "leo", name: "Leo", description: "Calm & curious" },
];

export type TutorPickerProps = {
  value: TutorId;
  onChange: (tutor: TutorId) => void;
  disabled?: boolean;
};

export function TutorPicker({ value, onChange, disabled = false }: TutorPickerProps) {
  const id = useId();
  return <fieldset className="tutor-picker" role="radiogroup" aria-label="Your guide" disabled={disabled}>
    <legend>Your guide</legend>
    <div className="tutor-picker-options">
      {tutors.map((tutor) => <label key={tutor.id} className={"tutor-choice" + (value === tutor.id ? " selected" : "")}>
        <input type="radio" name={id} value={tutor.id} checked={value === tutor.id} aria-label={tutor.name}
          aria-describedby={id + "-" + tutor.id} onChange={() => onChange(tutor.id)} />
        <TutorPortrait tutor={tutor.id} small />
        <span className="tutor-choice-copy"><strong>{tutor.name}</strong><small id={id + "-" + tutor.id}>{tutor.description}</small></span>
        <Check size={13} className="tutor-choice-check" aria-hidden="true" />
      </label>)}
    </div>
  </fieldset>;
}
