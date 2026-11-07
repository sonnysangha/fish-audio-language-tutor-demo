import { readJson, safeError, sameOrigin } from "@/lib/guard";
import { parseNativeGuidanceContext } from "@/lib/native-voice-contract";
import { persistentGuidanceSession } from "@/lib/tutor";
import { TutorError } from "@/lib/tutor-contract";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return safeError("Use speaking guidance from this app.", 403);
  try {
    const input = parseNativeGuidanceContext(await readJson(request, 8192));
    return Response.json(await persistentGuidanceSession(input, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return error instanceof TutorError ? safeError(error.message, error.status)
      : safeError("The guidance connection could not be prepared.", 400);
  }
}
