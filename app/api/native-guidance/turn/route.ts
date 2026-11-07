import { readJson, safeError, sameOrigin } from "@/lib/guard";
import { parseNativeGuidanceInput } from "@/lib/native-voice-contract";
import { persistentGuidanceTurn } from "@/lib/tutor";
import { TutorError } from "@/lib/tutor-contract";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return safeError("Use speaking guidance from this app.", 403);
  try {
    const body = await readJson(request, 65536);
    if (!body.input || typeof body.input !== "object" || Array.isArray(body.input))
      throw new TutorError("Send the current tutor reply for guidance.", 400);
    const input = parseNativeGuidanceInput(body.input as Record<string, unknown>);
    return Response.json(persistentGuidanceTurn(body.endToken, input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return error instanceof TutorError ? safeError(error.message, error.status)
      : safeError("The guidance request could not be read.", 400);
  }
}
