import { FishAudioClient, type Backends, type TTSRequest } from "fish-audio";
import type { LanguageId, TutorId } from "./types";
import { getTutorVoice } from "./tutor-voices";
import { DEFAULT_SPEECH_MODEL, isSpeechModel, type SpeechModelId } from "./speech-models";
import { isTranslationVoice, type TranslationVoice } from "./translation-voice";

export const FISH_TTS_MODEL = DEFAULT_SPEECH_MODEL;
export const MAX_RECORDING_BYTES = 5 * 1024 * 1024;

function apiKey() {
  return process.env.FISH_AUDIO_API_KEY ?? process.env.FISH_API_KEY;
}

export function isFishReady() {
  return Boolean(apiKey());
}

function translationVoiceId() {
  const id = process.env.FISH_AUDIO_TRANSLATION_VOICE_ID;
  return id && /^[a-f0-9]{32}$/i.test(id) ? id : undefined;
}

export function isTranslationCloneReady() {
  return Boolean(translationVoiceId());
}

export class TranslationVoiceUnavailableError extends Error {
  constructor() {
    super("The personal voice needs setup. Choose the language voice or finish setup.");
    this.name = "TranslationVoiceUnavailableError";
  }
}

export async function generateSpeech(
  text: string,
  language: LanguageId,
  tutor: TutorId,
  signal: AbortSignal,
  model: SpeechModelId = DEFAULT_SPEECH_MODEL,
  voice: TranslationVoice = "language",
) {
  signal.throwIfAborted();
  if (!isSpeechModel(model)) throw new Error("Choose a supported voice model.");
  if (!isTranslationVoice(voice)) throw new Error("Choose a supported voice.");
  const referenceId = voice === "personal" ? translationVoiceId() : getTutorVoice(language, tutor).id;
  if (!referenceId) throw new TranslationVoiceUnavailableError();
  const key = apiKey();
  if (!key) throw new Error("Fish Audio is unavailable.");
  const client = new FishAudioClient({ apiKey: key });
  // SDK 0.1.0 forwards the complete request but predates this documented field.
  const request: TTSRequest & { language: LanguageId } = {
    text,
    language,
    reference_id: referenceId,
    format: "pcm",
    sample_rate: 24000,
    latency: "normal",
  };
  const audio = await client.textToSpeech.convert(
    request,
    // The SDK forwards this exact allowlisted model; its older type omits it.
    model as Backends,
    {
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
      timeoutInSeconds: 60,
      maxRetries: 0,
    },
  );
  return new Response(audio, { headers: { "Cache-Control": "no-store" } });
}

export function transcribeRecording(
  audio: Blob,
  language: LanguageId,
  signal: AbortSignal,
) {
  const mime = audio.type.toLowerCase().split(";")[0];
  const extension = mime.includes("mp4")
    ? "m4a"
    : mime.includes("ogg")
      ? "ogg"
      : mime.includes("wav")
        ? "wav"
        : "webm";
  const form = new FormData();
  form.append("audio", audio, `practice.${extension}`);
  form.append("language", language.split("-")[0].toLowerCase());
  form.append("ignore_timestamps", "true");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");
  const key = apiKey();
  if (!key) throw new Error("Fish Audio is unavailable.");
  // The official SDK drops diarize/tag_audio_events and has no fetcher hook.
  // Its SDK skill documents raw HTTP for these Pro-only request fields.
  return fetch("https://api.fish.audio/v1/asr", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, model: "transcribe-1-pro" },
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    cache: "no-store",
  });
}
