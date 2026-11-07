// Keep this allowlist explicit: Fish falls back to a paid model when the model
// header is missing or unrecognized. This registry is safe to import in the UI.
export const speechModels = [
  { id: "s2.1-pro-free", label: "S2.1 Pro Free", paid: false },
  { id: "drama-3", label: "Drama 3", paid: true },
  { id: "s2.1-pro", label: "S2.1 Pro", paid: true },
  { id: "s2-pro", label: "S2 Pro", paid: true },
] as const;

export type SpeechModelId = (typeof speechModels)[number]["id"];
export const DEFAULT_SPEECH_MODEL: SpeechModelId = "s2.1-pro-free";

// The picker offers two products. Keep legacy/provider IDs above valid for
// existing requests; only the user-facing choices are simplified.
export const standardSpeechModelIds = ["s2.1-pro-free", "drama-3"] as const satisfies readonly SpeechModelId[];

export function selectableSpeechModels(allowed: readonly SpeechModelId[] = standardSpeechModelIds) {
  const s21 = allowed.includes("s2.1-pro-free") ? "s2.1-pro-free" : "s2.1-pro";
  return [s21, "drama-3"].flatMap((id) => {
    const model = speechModels.find((item) => item.id === id);
    return model && allowed.includes(model.id) ? [model] : [];
  });
}

export function isSpeechModel(value: unknown): value is SpeechModelId {
  return speechModels.some((model) => model.id === value);
}
