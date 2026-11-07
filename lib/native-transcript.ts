export type NativeTranscriptSegment = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
  order: number;
};

export type NativeTranscriptGroup = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
  signature: string;
};

/** Keep the SDK's first-seen order when later final transcripts revise a row. */
export function upsertNativeTranscript(segments: readonly NativeTranscriptSegment[], incoming: NativeTranscriptSegment) {
  const existing = segments.find((segment) => segment.id === incoming.id);
  if (existing && ((existing.final && !incoming.final) ||
      (existing.text === incoming.text && existing.final === incoming.final))) return segments;
  const next = existing
    ? segments.map((segment) => segment.id === incoming.id ? { ...incoming, order: segment.order } : segment)
    : [...segments, incoming];
  return next.sort((a, b) => a.order - b.order);
}

/** Adjacent segments by either speaker form one utterance without changing their words. */
export function groupNativeTranscript(segments: readonly NativeTranscriptSegment[]): NativeTranscriptGroup[] {
  const groups: NativeTranscriptSegment[][] = [];
  for (const segment of [...segments].sort((a, b) => a.order - b.order)) {
    const previous = groups.at(-1);
    if (previous?.[0].role === segment.role) previous.push(segment);
    else groups.push([segment]);
  }
  return groups.map((group) => ({
    id: group[0].id,
    role: group[0].role,
    text: group.map((segment) => segment.text).filter(Boolean).join("\n"),
    final: group.every((segment) => segment.final),
    signature: JSON.stringify(group.map(({ id, text, final }) => [id, text, final])),
  }));
}

/** The exact latest completed assistant group is the only valid guidance target. */
export function latestNativeGuidanceTarget(segments: readonly NativeTranscriptSegment[]) {
  const latest = groupNativeTranscript(segments).at(-1);
  return latest?.role === "assistant" && latest.final && latest.text.trim() && latest.text.length <= 2000 ? latest : null;
}
import type { NativeGuidanceReply } from "./native-voice-contract";
import type { HistoryMessage } from "./types";


export type NativeGuidanceJob = {
  key: string;
  assistant: NativeTranscriptGroup;
  user: NativeTranscriptGroup | null;
  history: HistoryMessage[];
};

/** Capture every completed tutor turn, with only its nearest completed learner utterance. */
export function nativeGuidanceJobs(segments: readonly NativeTranscriptSegment[]): NativeGuidanceJob[] {
  const groups = groupNativeTranscript(segments);
  return groups.flatMap((assistant, index) => {
    if (assistant.role !== "assistant" || !assistant.final || !assistant.text.trim() || assistant.text.length > 2000) return [];
    const preceding = groups[index - 1];
    // Never skip an interim/oversized learner utterance and translate an older one instead.
    const user = preceding?.role === "user" && preceding.final && preceding.text.trim() && preceding.text.length <= 1000 ? preceding : null;
    return [{
      key: JSON.stringify([assistant.signature, user?.signature ?? null]),
      assistant,
      user,
      history: groups.slice(0, index + 1).filter((group) => group.final && group.text.trim()).slice(-12)
        .map(({ role, text }) => ({ role, text: text.slice(0, 1000) })),
    }];
  });
}

export function latestNativeGuidanceJob(segments: readonly NativeTranscriptSegment[]) {
  const latest = groupNativeTranscript(segments).at(-1);
  if (latest?.role !== "assistant") return null;
  return nativeGuidanceJobs(segments).find((job) => job.assistant.signature === latest.signature) ?? null;
}

/** Historical English remains applicable only while that exact captured utterance survives. */
export function nativeTranslationEntries(job: NativeGuidanceJob,
  reply: Pick<NativeGuidanceReply, "translation" | "userTranslation">,
  segments: readonly NativeTranscriptSegment[]): Array<[string, string]> {
  const signatures = new Set(groupNativeTranscript(segments).map((group) => group.signature));
  const entries: Array<[string, string]> = [];
  if (signatures.has(job.assistant.signature) && reply.translation.trim()) entries.push([job.assistant.signature, reply.translation]);
  if (job.user && signatures.has(job.user.signature) && reply.userTranslation.trim()) entries.push([job.user.signature, reply.userTranslation]);
  return entries;
}
