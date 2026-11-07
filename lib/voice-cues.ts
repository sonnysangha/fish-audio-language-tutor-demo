export const voiceCueCategories = [
  { id: "emotions", label: "Emotions" },
  { id: "actions", label: "Vocal actions" },
  { id: "pairings", label: "Pairings" },
  { id: "directions", label: "Directions" },
] as const;

export type VoiceCueCategory = (typeof voiceCueCategories)[number]["id"];
export type VoiceCue = { id: string; category: VoiceCueCategory; label: string; tag: string };

// Presets are examples, not an allowlist: the editor also accepts custom directions.
export const voiceCues: readonly VoiceCue[] = [
  { id: "warm", category: "emotions", label: "Warm", tag: "[warm and encouraging]" },
  { id: "excited", category: "emotions", label: "Excited", tag: "[excited]" },
  { id: "curious", category: "emotions", label: "Curious", tag: "[curious]" },
  { id: "calm", category: "emotions", label: "Calm", tag: "[calm]" },
  { id: "panting", category: "actions", label: "Panting", tag: "[panting]" },
  { id: "laughing", category: "actions", label: "Laugh", tag: "[laughing]" },
  { id: "chuckling", category: "actions", label: "Chuckle", tag: "[chuckling]" },
  { id: "clears-throat", category: "actions", label: "Clear throat", tag: "[clears throat]" },
  { id: "sighing", category: "actions", label: "Sigh", tag: "[sighing]" },
  { id: "whispering", category: "actions", label: "Whisper", tag: "[whispering]" },
  { id: "emphasis", category: "actions", label: "Emphasis", tag: "[emphasis]" },
  { id: "pause", category: "actions", label: "Pause", tag: "[break]" },
  { id: "out-of-breath", category: "pairings", label: "Out of breath", tag: "[panting] [tired]" },
  { id: "excited-laughter", category: "pairings", label: "Excited laughter", tag: "[laughing] [excited]" },
  { id: "indignant", category: "pairings", label: "Indignant", tag: "[clears throat] [angry]" },
  { id: "with-a-sigh", category: "pairings", label: "With a sigh", tag: "[sighing] [emphasis]" },
  { id: "calm-expert", category: "directions", label: "Calm expert", tag: "[the calm, measured tone of someone who has done this a thousand times]" },
  { id: "exhausted", category: "directions", label: "Exhausted", tag: "[dead tired, end of a very long shift]" },
  { id: "holding-back-tears", category: "directions", label: "Holding back tears", tag: "[voice rough from crying, trying to sound normal]" },
];

/** Replace the current selection and keep a word boundary on either side of every cue. */
export function insertVoiceCue(value: string, tag: string, start: number, end: number, maxLength: number) {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  const before = value.slice(0, from);
  const after = value.slice(to);
  const insertion = (before && !/\s$/.test(before) ? " " : "") + tag + (after.startsWith(" ") ? "" : " ");
  const text = before + insertion + after;
  if (text.length > maxLength) return null;
  return { text, cursor: from + insertion.length + (after.startsWith(" ") ? 1 : 0) };
}
