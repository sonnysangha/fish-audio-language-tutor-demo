import { FishAudioError } from "fish-audio";
import { generateSpeech, isFishReady, TranslationVoiceUnavailableError } from "@/lib/fish";
import { readJson, safeError, sameOrigin } from "@/lib/guard";
import { isLanguage, isTutor, speechTextError } from "@/lib/types";
import { DEFAULT_SPEECH_MODEL, isSpeechModel } from "@/lib/speech-models";
import { isTranslationVoice } from "@/lib/translation-voice";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return safeError("Open this practice from Sona.", 403);
  if (!isFishReady()) return safeError("The voice connection needs setup.", 503);
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 8192);
  } catch {
    return safeError("Send a valid practice line.");
  }
  const textError = speechTextError(body.text);
  if (textError) return safeError(textError);
  if (!isLanguage(body.language) || !isTutor(body.tutor))
    return safeError("Choose a language and tutor.");
  const model = body.model === undefined ? DEFAULT_SPEECH_MODEL : body.model;
  if (!isSpeechModel(model)) return safeError("Choose a supported voice model.");
  const voice = body.voice === undefined ? "language" : body.voice;
  if (!isTranslationVoice(voice)) return safeError("Choose a supported voice.");
  try {
    const response = await generateSpeech(
      body.text as string,
      body.language,
      body.tutor,
      request.signal,
      model,
      voice,
    );
    if (!response.ok || !response.body)
      return safeError("The voice could not be generated. Please try again.", 502);
    return new Response(response.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Audio-Sample-Rate": "24000",
        "X-Audio-Encoding": "pcm-s16le",
        "X-Speech-Model": model,
      },
    });
  } catch (cause) {
    if (cause instanceof TranslationVoiceUnavailableError)
      return safeError(cause.message, 503);
    if (cause instanceof FishAudioError && cause.statusCode === 402)
      return safeError("This voice model needs Fish Audio credits. Add credits or choose S2.1 Pro Free.", 402);
    return safeError("The voice connection stopped. Please try again.", 502);
  }
}
