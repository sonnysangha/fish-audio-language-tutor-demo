import { isFishReady, isTranslationCloneReady } from "@/lib/fish";
import { isTutorReady } from "@/lib/tutor";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    {
      fishReady: isFishReady(),
      translationCloneReady: isTranslationCloneReady(),
      tutorReady: await isTutorReady(),
      model: "S2.1 Pro",
      conversationEngine: "Fish Audio Agents",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
