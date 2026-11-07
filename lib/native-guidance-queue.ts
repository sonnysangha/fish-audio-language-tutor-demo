import type { NativeGuidanceReply } from "./native-voice-contract";
import type { NativeGuidanceJob } from "./native-transcript";

type JobState = "pending" | "active" | "done" | "failed" | "missing";

/** Serial supplemental work: new speech never discards a historical translation in flight. */
export function createNativeGuidanceQueue({ run, onResult, onChange, debounceMs = 120 }: {
  run: (job: NativeGuidanceJob, signal: AbortSignal) => Promise<NativeGuidanceReply>;
  onResult: (job: NativeGuidanceJob, reply: NativeGuidanceReply) => void;
  onChange?: () => void;
  debounceMs?: number;
}) {
  let closed = false;
  let pending: NativeGuidanceJob[] = [];
  let active: { job: NativeGuidanceJob; controller: AbortController } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = new Map<string, "done" | "failed">();

  function schedule() {
    if (closed || active || timer || !pending.length) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (closed || active || !pending.length) return;
      const current = { job: pending.shift()!, controller: new AbortController() };
      active = current;
      onChange?.();
      void Promise.resolve().then(() => {
        if (closed || active !== current) throw new DOMException("The conversation ended.", "AbortError");
        return run(current.job, current.controller.signal);
      }).then((reply) => {
        if (closed || active !== current) return;
        finished.set(current.job.key, "done");
        onResult(current.job, reply);
      }).catch(() => {
        if (!closed && active === current) finished.set(current.job.key, "failed");
      }).finally(() => {
        if (closed || active !== current) return;
        active = null;
        onChange?.();
        schedule();
      });
    }, debounceMs);
  }

  return {
    sync(jobs: readonly NativeGuidanceJob[]) {
      if (closed) return;
      const unique = new Map<string, NativeGuidanceJob>();
      for (const job of jobs) {
        if (!finished.has(job.key) && active?.job.key !== job.key) unique.set(job.assistant.id, job);
      }
      // A revised pending utterance replaces its old job; unrelated completed turns stay queued.
      pending = [...unique.values()];
      if (!pending.length) { clearTimeout(timer); timer = undefined; }
      onChange?.();
      schedule();
    },
    state(key: string): JobState {
      if (active?.job.key === key) return "active";
      return finished.get(key) ?? (pending.some((job) => job.key === key) ? "pending" : "missing");
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      pending = [];
      active?.controller.abort();
      active = null;
    },
  };
}
