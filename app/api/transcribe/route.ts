import { isFishReady, MAX_RECORDING_BYTES, transcribeRecording } from "@/lib/fish";
import { boundedBody, safeError, sameOrigin } from "@/lib/guard";
import { isLanguage } from "@/lib/types";

export const runtime = "nodejs";
const acceptedTypes = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/ogg",
]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return safeError("Open this practice from Sona.", 403);
  if (!isFishReady()) return safeError("The voice connection needs setup.", 503);
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data"))
    return safeError("Send an audio recording.");

  let form: FormData;
  try {
    const bytes = await boundedBody(request, MAX_RECORDING_BYTES + 65536);
    form = await new Response(bytes.buffer as ArrayBuffer, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    return safeError("Send a recording up to 5 MiB.", 413);
  }
  const audio = form.get("audio");
  const language = form.get("language");
  if (!(audio instanceof Blob) || !audio.size || !isLanguage(language))
    return safeError("Add a recording and choose a language.");
  if (audio.size > MAX_RECORDING_BYTES)
    return safeError("Keep recordings within 5 MiB.", 413);
  if (!acceptedTypes.has(audio.type.toLowerCase().split(";")[0]))
    return safeError("Use a WebM, MP4, WAV or Ogg audio recording.");
  try {
    const response = await transcribeRecording(audio, language, request.signal);
    if (!response.ok)
      return safeError("The recording could not be transcribed. Please try again.", 502);
    const result = await response.json();
    if (typeof result.text !== "string")
      return safeError("The transcript was unavailable. Please try again.", 502);
    return Response.json(
      {
        text: result.text,
        language: typeof result.language_code === "string" ? result.language_code : undefined,
        duration: typeof result.duration === "number" ? result.duration : undefined,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return safeError("The recording could not be transcribed. Please try again.", 502);
  }
}
