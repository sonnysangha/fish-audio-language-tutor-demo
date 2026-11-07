/** Browser autoplay rules can leave resume() pending instead of rejecting it. */
export function resumeAudioContext(
  audio: Pick<AudioContext, "state" | "resume">,
  signal: AbortSignal,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      signal.removeEventListener("abort", abort);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };
    const abort = () => fail(signal.reason ?? new DOMException("Audio stopped.", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => fail(new Error("Audio could not start. Press Play to try again.")), timeoutMs);
    try {
      void audio.resume().then(() => {
        if (settled) return;
        if (audio.state !== "running") {
          fail(new Error("Audio is paused by your browser. Press Play to try again."));
          return;
        }
        settled = true;
        cleanup();
        resolve();
      }, fail);
    } catch (cause) {
      fail(cause);
    }
  });
}
