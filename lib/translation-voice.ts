/** Public selection keys only. Private voice IDs stay on the server. */
export type TranslationVoice = "language" | "personal";

export function isTranslationVoice(value: unknown): value is TranslationVoice {
  return value === "language" || value === "personal";
}
