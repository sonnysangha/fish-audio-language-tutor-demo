import { readJson, safeError, sameOrigin } from "@/lib/guard";
import { tutorReply } from "@/lib/tutor";
import { parseTutorInput, TutorError } from "@/lib/tutor-contract";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return safeError("Use the tutor from this app.", 403);
  try {
    const body = await readJson(request, 65536);
    const input = parseTutorInput(body);
    return Response.json(await tutorReply(input, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return error instanceof TutorError
      ? safeError(error.message, error.status)
      : safeError("The tutor could not read this request. Please try again.", 400);
  }
}
