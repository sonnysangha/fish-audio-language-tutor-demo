import assert from "node:assert/strict";
import test from "node:test";
import { groupNativeTranscript, latestNativeGuidanceTarget, latestNativeGuidanceJob, nativeGuidanceJobs, nativeTranslationEntries, upsertNativeTranscript, type NativeTranscriptSegment } from "../lib/native-transcript";

const segment = (id: string, role: "user" | "assistant", order: number, text: string, final = true): NativeTranscriptSegment => ({ id, role, order, text, final });

test("late user finalization keeps the original row order and current reply guidance", () => {
  const initial = [segment("user:1", "user", 0, "Un café", false), segment("assistant:1", "assistant", 1, "¿Con leche?")];
  const target = latestNativeGuidanceTarget(initial)!;
  const revised = upsertNativeTranscript(initial, segment("user:1", "user", 99, "Un café, por favor."));
  assert.deepEqual(revised.map(({ id, order }) => ({ id, order })), [{ id: "user:1", order: 0 }, { id: "assistant:1", order: 1 }]);
  assert.equal(latestNativeGuidanceTarget(revised)?.signature, target.signature);
  assert.equal(initial[0].final, false);
});

test("adjacent assistant segments form one stable bubble with every native word", () => {
  const initial = [segment("assistant:1", "assistant", 0, "¡Hola!"), segment("assistant:2", "assistant", 1, "¿Qué quieres beber?")];
  const groups = groupNativeTranscript(initial);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "assistant:1");
  assert.equal(groups[0].text, "¡Hola!\n¿Qué quieres beber?");
  assert.equal(groups[0].final, true);
  const revised = upsertNativeTranscript(initial, segment("assistant:2", "assistant", 1, "¿Qué te gustaría beber?"));
  assert.equal(groupNativeTranscript(revised)[0].id, groups[0].id);
  assert.notEqual(latestNativeGuidanceTarget(revised)?.signature, groups[0].signature);
});

test("a user starting or an unfinished assistant segment invalidates the previous guidance", () => {
  const reply = [segment("assistant:1", "assistant", 0, "¿Café o té?")];
  assert.ok(latestNativeGuidanceTarget(reply));
  assert.equal(latestNativeGuidanceTarget([...reply, segment("user:1", "user", 1, "", false)]), null);
  assert.equal(latestNativeGuidanceTarget([...reply, segment("assistant:2", "assistant", 1, "Tenemos", false)]), null);
  const separated = groupNativeTranscript([...reply, segment("user:1", "user", 1, "Té."), segment("assistant:2", "assistant", 2, "¿Con limón?")]);
  assert.equal(separated.length, 3);
});

test("duplicate and stale partial updates cannot regress or reorder finalized content", () => {
  const final = [segment("assistant:1", "assistant", 0, "Bonjour.")];
  assert.equal(upsertNativeTranscript(final, segment("assistant:1", "assistant", 4, "Bon", false)), final);
  assert.equal(upsertNativeTranscript(final, segment("assistant:1", "assistant", 4, "Bonjour.")), final);
  const sorted = groupNativeTranscript([segment("assistant:2", "assistant", 2, "Ciao."), segment("user:1", "user", 1, "Ciao!")]);
  assert.deepEqual(sorted.map(({ role }) => role), ["user", "assistant"]);
});

test("adjacent learner segments share one complete translation target", () => {
  const segments = [segment("user:1", "user", 0, "Un café,"), segment("user:2", "user", 1, "por favor."), segment("assistant:1", "assistant", 2, "¿Con leche?")];
  const groups = groupNativeTranscript(segments);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].text, "Un café,\npor favor.");
  assert.equal(latestNativeGuidanceJob(segments)?.user?.signature, groups[0].signature);
});

test("interim nearest learner is not replaced with an older completed learner", () => {
  const segments = [segment("user:1", "user", 0, "Hola."), segment("assistant:1", "assistant", 1, "¿Qué quieres?"),
    segment("user:2", "user", 2, "Un", false), segment("assistant:2", "assistant", 3, "¿Un café?")];
  const waiting = latestNativeGuidanceJob(segments)!;
  assert.equal(waiting.user, null);
  const revised = upsertNativeTranscript(segments, segment("user:2", "user", 2, "Un café."));
  const ready = latestNativeGuidanceJob(revised)!;
  assert.equal(ready.user?.text, "Un café.");
  assert.notEqual(ready.key, waiting.key);
  assert.equal(ready.assistant.signature, waiting.assistant.signature);
});

test("older in-flight English applies after fast later turns but never after text correction", () => {
  const first = [segment("user:1", "user", 0, "Un té."), segment("assistant:1", "assistant", 1, "¿Con limón?")];
  const job = latestNativeGuidanceJob(first)!;
  const later = [...first, segment("user:2", "user", 2, "Sí."), segment("assistant:2", "assistant", 3, "¿Algo más?")];
  assert.deepEqual(nativeTranslationEntries(job, { translation: "With lemon?", userTranslation: "A tea." }, later),
    [[job.assistant.signature, "With lemon?"], [job.user!.signature, "A tea."]]);
  const corrected = upsertNativeTranscript(later, segment("user:1", "user", 0, "Un café."));
  assert.deepEqual(nativeTranslationEntries(job, { translation: "With lemon?", userTranslation: "A tea." }, corrected),
    [[job.assistant.signature, "With lemon?"]]);
  assert.notEqual(nativeGuidanceJobs(corrected)[0].key, job.key);
});

test("empty English never falls back to original words and oversized learners are not partially translated", () => {
  const first = [segment("user:1", "user", 0, "Un té."), segment("assistant:1", "assistant", 1, "¿Con limón?")];
  const job = latestNativeGuidanceJob(first)!;
  assert.deepEqual(nativeTranslationEntries(job, { translation: "", userTranslation: "" }, first), []);
  const long = [segment("user:1", "user", 0, "a".repeat(1001)), first[1]];
  const bounded = latestNativeGuidanceJob(long)!;
  assert.equal(bounded.user, null);
  assert.deepEqual(nativeTranslationEntries(bounded, { translation: "With lemon?", userTranslation: "partial" }, long),
    [[bounded.assistant.signature, "With lemon?"]]);
});
