import assert from "node:assert/strict";
import test from "node:test";
import { createNativeGuidanceQueue } from "../lib/native-guidance-queue";
import { nativeGuidanceJobs, type NativeGuidanceJob, type NativeTranscriptSegment } from "../lib/native-transcript";
import type { NativeGuidanceReply } from "../lib/native-voice-contract";

const segments: NativeTranscriptSegment[] = [
  { id: "u1", role: "user", order: 0, text: "Un café.", final: true },
  { id: "a1", role: "assistant", order: 1, text: "¿Con leche?", final: true },
  { id: "u2", role: "user", order: 2, text: "Sí.", final: true },
  { id: "a2", role: "assistant", order: 3, text: "¿Algo más?", final: true },
];
const jobs = nativeGuidanceJobs(segments);
const reply: NativeGuidanceReply = { translation: "With milk?", userTranslation: "A coffee.", pronunciation: "kon leche",
  option1: { text: "Sí.", meaning: "Yes.", pronunciation: "si" },
  option2: { text: "No.", meaning: "No.", pronunciation: "no" },
  option3: { text: "Un poco.", meaning: "A little.", pronunciation: "un poco" } };
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("fast later replies queue without aborting historical English, one request at a time", async () => {
  const started: Array<{ job: NativeGuidanceJob; signal: AbortSignal; finish: (value: NativeGuidanceReply) => void }> = [];
  const results: string[] = [];
  const queue = createNativeGuidanceQueue({ debounceMs: 0,
    run: (job, signal) => new Promise((finish) => { started.push({ job, signal, finish }); }),
    onResult: (job) => { results.push(job.key); },
  });
  queue.sync([jobs[0]]);
  await tick();
  queue.sync(jobs);
  const allJobs = nativeGuidanceJobs([...segments,
    { id: "u3", role: "user", order: 4, text: "Una galleta.", final: true },
    { id: "a3", role: "assistant", order: 5, text: "¿De chocolate?", final: true },
  ]);
  queue.sync(allJobs);
  await tick();
  assert.equal(started.length, 1);
  assert.equal(started[0].signal.aborted, false);
  started[0].finish(reply);
  await tick();
  assert.deepEqual(results, [jobs[0].key]);
  assert.equal(started.length, 2);
  started[1].finish(reply);
  await tick();
  assert.equal(started.length, 3);
  started[2].finish(reply);
  await tick();
  queue.sync(allJobs);
  await tick();
  assert.equal(started.length, 3);
  assert.deepEqual(results, allJobs.map(({ key }) => key));
  queue.close();
});

test("pending transcript corrections replace obsolete work without losing other turns", async () => {
  const started: Array<{ job: NativeGuidanceJob; finish: (value: NativeGuidanceReply) => void }> = [];
  const queue = createNativeGuidanceQueue({ debounceMs: 0,
    run: (job) => new Promise((finish) => { started.push({ job, finish }); }), onResult: () => {},
  });
  queue.sync(jobs);
  await tick();
  const corrected = nativeGuidanceJobs(segments.map((segment) => segment.id === "u2" ? { ...segment, text: "No." } : segment));
  queue.sync(corrected);
  started[0].finish(reply);
  await tick();
  assert.equal(started[1].job.key, corrected[1].key);
  assert.notEqual(started[1].job.key, jobs[1].key);
  queue.close();
});

test("ending aborts active work, prevents queued requests, and ignores late completion", async () => {
  let finish!: (value: NativeGuidanceReply) => void;
  let signal!: AbortSignal;
  let calls = 0;
  let results = 0;
  const queue = createNativeGuidanceQueue({ debounceMs: 0,
    run: (_job, currentSignal) => { calls++; signal = currentSignal; return new Promise((resolve) => { finish = resolve; }); },
    onResult: () => { results++; },
  });
  queue.sync(jobs);
  await tick();
  queue.close();
  assert.equal(signal.aborted, true);
  finish(reply);
  await tick();
  assert.equal(calls, 1);
  assert.equal(results, 0);
});

test("late finalization queues a historical learner translation even after newer turns finished", async () => {
  const pendingUser = segments.map((segment) => segment.id === "u1" ? { ...segment, final: false } : segment);
  const before = nativeGuidanceJobs(pendingUser);
  const started: string[] = [];
  const queue = createNativeGuidanceQueue({ debounceMs: 0,
    run: async (job) => { started.push(job.key); return reply; }, onResult: () => {},
  });
  queue.sync(before);
  await tick();
  await tick();
  assert.deepEqual(started, before.map(({ key }) => key));
  queue.sync(jobs);
  await tick();
  assert.deepEqual(started, [...before.map(({ key }) => key), jobs[0].key]);
  queue.close();
});
