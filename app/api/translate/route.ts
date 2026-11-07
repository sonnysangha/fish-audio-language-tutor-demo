import { readJson, safeError, sameOrigin } from "@/lib/guard";
import { translatePhrase } from "@/lib/tutor";
import { parseTranslationInput, TutorError } from "@/lib/tutor-contract";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return safeError("Use translation from this app.", 403);
  try {
    const input = parseTranslationInput(await readJson(request, 8192));
    return Response.json(await translatePhrase(input, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return error instanceof TutorError
      ? safeError(error.message, error.status)
      : safeError("The translation request could not be read. Please try again.", 400);
  }
}
