type QueuedTranslation = { start: () => void };

/** Keep card translations below the server's four-session limit. */
export function createTranslationQueue(maximumActive = 2) {
  if (!Number.isInteger(maximumActive) || maximumActive < 1)
    throw new RangeError("The translation concurrency must be a positive integer.");
  let active = 0;
  const waiting: QueuedTranslation[] = [];

  const drain = () => {
    while (active < maximumActive && waiting.length) waiting.shift()!.start();
  };

  return function enqueue<T>(run: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abortReason = () => signal.reason ?? new DOMException("The request was cancelled.", "AbortError");
      if (signal.aborted) { reject(abortReason()); return; }
      let started = false;
      const onAbort = () => {
        if (!started) {
          const index = waiting.indexOf(job);
          if (index !== -1) waiting.splice(index, 1);
          signal.removeEventListener("abort", onAbort);
        }
        // A running job retains its slot until its Fish session cleanup settles.
        reject(abortReason());
      };
      const finish = () => {
        active--;
        signal.removeEventListener("abort", onAbort);
        drain();
      };
      const job: QueuedTranslation = {
        start() {
          if (signal.aborted) { onAbort(); return; }
          started = true;
          active++;
          void Promise.resolve().then(() => {
            signal.throwIfAborted();
            return run(signal);
          }).then((value) => {
            if (signal.aborted) reject(abortReason());
            else resolve(value);
            finish();
          }, (error: unknown) => {
            reject(error);
            finish();
          });
        },
      };
      signal.addEventListener("abort", onAbort, { once: true });
      waiting.push(job);
      drain();
    });
  };
}

export const queueTranslation = createTranslationQueue();
