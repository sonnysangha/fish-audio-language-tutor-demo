import { readJson, safeError, sameOrigin } from "@/lib/guard";
import { endTutorSession } from "@/lib/tutor";
import { TutorError } from "@/lib/tutor-contract";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return safeError("Close the session from this app.", 403);
  try {
    const body = await readJson(request, 512);
    await endTutorSession(body.endToken);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return error instanceof TutorError
      ? safeError(error.message, error.status)
      : safeError("The session request could not be read.", 400);
  }
}
