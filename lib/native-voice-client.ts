"use client";

import type { AgentMode, AgentSession, AgentSessionOptions, SessionStatus, SessionToken } from "@fishaudio/agent-client";
import { parseNativeVoiceInput, type NativeVoiceInput } from "./native-voice-contract";
import { TutorError } from "./tutor-contract";
import { MAX_TEXT_LENGTH } from "./types";

type NativeSession = Pick<AgentSession, "sendUserMessage" | "setOutputVolume" | "setMicMuted" | "startAudio" | "end">;
type SessionStarter = (options: AgentSessionOptions) => Promise<NativeSession>;
type Dependencies = { start?: SessionStarter; fetch?: typeof fetch; timeoutMs?: number };
export type NativeVoiceStatus = "idle" | SessionStatus;
// The Fish SDK does not expose capture timestamps or turn IDs. This is stable
// first-observed order, not an inferred audio timestamp or a completed turn.
export type NativeTranscriptMetadata = { order: number };
export type NativeVoiceCallbacks = {
  onStatus?: (status: NativeVoiceStatus) => void;
  onMode?: (mode: AgentMode) => void;
  onTranscript?: (segmentId: string, role: "user" | "assistant", text: string, final: boolean, metadata: NativeTranscriptMetadata) => void;
  onError?: (error: TutorError) => void;
};

const defaultStart: SessionStarter = async (options) => {
  const { AgentSession } = await import("@fishaudio/agent-client");
  return AgentSession.start(options);
};
const defaultFetch: typeof fetch = (...args) => fetch(...args);
const cancelled = () => new DOMException("The conversation was closed.", "AbortError");
function notify(fn: (() => void) | undefined) { try { fn?.(); } catch { /* UI callbacks cannot interrupt cleanup. */ } }
function safeError(cause?: unknown) {
  if (cause instanceof TutorError) return cause;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  return new TutorError(code === "mic_permission_denied"
    ? "Allow microphone access to start the voice conversation."
    : "The voice connection could not continue. Start a new conversation.");
}
function httpError(status: number) {
  return new TutorError(status === 402 ? "Fish Audio credits are needed to continue."
    : status === 429 ? "The tutor is busy. Please try again in a moment."
      : [401, 403, 503].includes(status) ? "The Fish Audio connection settings need attention."
        : "The voice connection is unavailable. Please try again.", status);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TutorError("The voice connection was incomplete. Please try again.");
  return value as Record<string, unknown>;
}
function tokenFrom(value: unknown): SessionToken {
  const token = record(value);
  if (token.transport !== "livekit" || typeof token.session_id !== "string" || !token.session_id ||
      typeof token.expires_at !== "string" || typeof token.token !== "string" || !token.token ||
      typeof token.livekit_url !== "string" || !token.livekit_url.startsWith("wss://") ||
      typeof token.max_duration_seconds !== "number" || token.max_duration_seconds <= 0 || token.max_duration_seconds > 600)
    throw new TutorError("The voice connection was incomplete. Please try again.");
  return value as SessionToken;
}

/** Own both resources even when a cancelled fetch or SDK start resolves late. */
function ownership(request: typeof fetch) {
  let closed = false;
  let current: NativeSession | undefined;
  let endToken: string | undefined;
  let serverEnd: Promise<void> | undefined;
  let sessionEnd: Promise<void> | undefined;
  function endServer() {
    if (!endToken) return Promise.resolve();
    serverEnd ??= Promise.resolve().then(() => request("/api/agent/end", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endToken }),
      signal: AbortSignal.timeout(5000), keepalive: true,
    })).then(() => {}, () => {});
    return serverEnd;
  }
  function endSession() {
    if (!current) return Promise.resolve();
    const session = current;
    if (!sessionEnd) {
      try { session.setOutputVolume(0); } catch {}
      sessionEnd = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5000);
        Promise.resolve().then(() => session.end()).catch(() => {}).finally(() => { clearTimeout(timer); resolve(); });
      });
    }
    return sessionEnd;
  }
  return {
    capture(data: Record<string, unknown>) {
      if (typeof data.endToken === "string" && data.endToken.length > 0 && data.endToken.length <= 512) endToken = data.endToken;
      if (closed) void endServer();
      if (!endToken) throw new TutorError("The voice connection was incomplete. Please try again.");
    },
    attach(session: NativeSession) { current = session; if (closed) { void endSession(); return false; } return true; },
    close() { closed = true; return Promise.all([endSession(), endServer()]).then(() => {}); },
  };
}

/** One native, continuously listening Fish session. Only user actions toggle its microphone. */
export function createNativeVoice(callbacks: NativeVoiceCallbacks = {}, dependencies: Dependencies = {}) {
  const request = dependencies.fetch ?? defaultFetch;
  const startSession = dependencies.start ?? defaultStart;
  const resources = ownership(request);
  const lifetime = new AbortController();
  let state: NativeVoiceStatus = "idle";
  let closed = false;
  let session: NativeSession | undefined;
  let outputEnabled = true;
  let outputRevision = 0;
  let detachAbort: (() => void) | undefined;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectStart: ((error: Error) => void) | undefined;
  const segments = new Map<string, { order: number; text: string; final: boolean }>();
  function status(next: NativeVoiceStatus) {
    if (state === next) return;
    state = next;
    notify(() => callbacks.onStatus?.(next));
  }
  function shutdown(error: Error = cancelled()) {
    if (!closed) {
      closed = true;
      clearTimeout(startupTimer); clearTimeout(expiryTimer);
      detachAbort?.();
      lifetime.abort();
      rejectStart?.(error); rejectStart = undefined;
      status("ended");
    }
    return resources.close();
  }
  function fail(cause?: unknown) {
    if (closed) return;
    const error = safeError(cause);
    notify(() => callbacks.onError?.(error));
    void shutdown(error);
  }
  function transcript(segmentId: string, role: "user" | "assistant", text: string, final: boolean) {
    if (closed) return;
    const key = `${role}:${segmentId}`;
    const previous = segments.get(key);
    if (previous && ((!final && previous.final) || (previous.text === text && previous.final === final))) return;
    if (text.length > 16000 || segmentId.length > 512) { fail(); return; }
    if (!previous && segments.size >= 8192) { fail(); return; }
    const order = previous?.order ?? segments.size;
    segments.set(key, { order, text, final });
    notify(() => callbacks.onTranscript?.(segmentId, role, text, final, { order }));
  }
  function start(input: NativeVoiceInput, signal: AbortSignal, options?: { microphone?: false }): Promise<void> {
    if (state !== "idle" || closed) return Promise.reject(new TutorError("Create a new voice connection before starting again.", 409));
    if (signal.aborted) { void shutdown(); return Promise.reject(cancelled()); }
    // Silent microphone overrides are available only to injected test transports.
    if (options?.microphone === false && !dependencies.start) return Promise.reject(new TutorError("Voice conversations require microphone access.", 400));
    let parsed: NativeVoiceInput;
    try { parsed = parseNativeVoiceInput(input as unknown as Record<string, unknown>); }
    catch (error) { return Promise.reject(safeError(error)); }
    status("connecting");
    const onAbort = () => { void shutdown(); };
    signal.addEventListener("abort", onAbort, { once: true });
    detachAbort = () => signal.removeEventListener("abort", onAbort);
    return new Promise<void>((resolve, reject) => {
      rejectStart = reject;
      startupTimer = setTimeout(() => fail(new TutorError("The voice connection took too long to start. Please try again.")), dependencies.timeoutMs ?? 60000);
      void (async () => {
        const response = await request("/api/native-session", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed), signal: lifetime.signal,
        });
        if (!response.ok) throw httpError(response.status);
        const data = record(await response.json());
        resources.capture(data);
        if (closed) return;
        const sessionToken = tokenFrom(data.sessionToken);
        const connected = await startSession({
          sessionToken, microphone: options?.microphone !== false, wakeLock: false,
          callbacks: {
            onStatusChange: (next) => {
              if (closed) return;
              if (next === "ended") { void shutdown(new TutorError("The voice conversation ended.")); return; }
              if (next === "reconnecting" || session) status(next);
            },
            onModeChange: (mode) => { if (!closed) notify(() => callbacks.onMode?.(mode)); },
            onUserTranscript: ({ segmentId, text, final }) => transcript(segmentId, "user", text, final),
            onAgentResponseDelta: ({ segmentId, text }) => transcript(segmentId, "assistant", text, false),
            onAgentResponse: ({ segmentId, text }) => transcript(segmentId, "assistant", text, true),
            onDisconnect: ({ reason }) => {
              if (reason === "connection_lost") fail();
              else void shutdown(new TutorError("The voice conversation ended."));
            },
            onError: fail,
            onToolCallStarted: () => fail(new TutorError("The voice conversation attempted an unsupported action.")),
          },
        });
        if (!resources.attach(connected) || closed) return;
        session = connected;
        connected.setOutputVolume(outputEnabled ? 1 : 0);
        // The published agent owns its first_message_prompt. Injecting a typed
        // opening here races with the already-published live microphone.
        if (closed) return;
        clearTimeout(startupTimer);
        expiryTimer = setTimeout(() => { void shutdown(new TutorError("The voice conversation reached its time limit.")); }, sessionToken.max_duration_seconds * 1000);
        rejectStart = undefined;
        status("connected");
        resolve();
      })().catch((cause) => { if (!closed) fail(cause); });
    });
  }
  function requireSession() {
    if (!session || closed || state !== "connected") throw new TutorError("Wait for the voice connection before continuing.", 409);
    return session;
  }
  return {
    start,
    send(text: string) {
      const active = requireSession();
      if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT_LENGTH)
        throw new TutorError("Enter a shorter message before sending.", 400);
      try { active.sendUserMessage(text, { audio: true }); } catch (cause) { fail(cause); throw safeError(cause); }
    },
    async setMuted(muted: boolean) {
      // A reconnect keeps the same live mic track. Pausing it must remain
      // available even while new speech/text turns are temporarily blocked.
      const active = muted && session && !closed && state === "reconnecting" ? session : requireSession();
      try { await active.setMicMuted(muted); }
      catch (cause) { const error = safeError(cause); notify(() => callbacks.onError?.(error)); throw error; }
    },
    async setOutputEnabled(enabled: boolean) {
      const previous = outputEnabled;
      const revision = ++outputRevision;
      outputEnabled = enabled;
      if (!session || closed) return;
      const active = session;
      try {
        active.setOutputVolume(enabled ? 1 : 0);
        if (enabled) await active.startAudio();
      } catch {
        if (!closed && session === active && revision === outputRevision) {
          outputEnabled = previous;
          try { active.setOutputVolume(previous ? 1 : 0); } catch {}
        }
        throw new TutorError("Tap the audio control again to enable playback.");
      }
    },
    close: () => shutdown(),
    getStatus: () => state,
  };
}
