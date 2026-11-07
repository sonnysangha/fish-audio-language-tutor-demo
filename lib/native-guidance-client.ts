"use client";

import type { AgentSession, AgentSessionOptions, SessionToken } from "@fishaudio/agent-client";
import {
  parseNativeGuidanceContext, parseNativeGuidanceInput, validateNativeGuidanceOutput,
  type NativeGuidanceContext, type NativeGuidanceInput, type NativeGuidanceReply,
} from "./native-voice-contract";
import { TutorError } from "./tutor-contract";

type SilentSession = Pick<AgentSession, "sendUserMessage" | "setOutputVolume" | "end">;
type Dependencies = {
  fetch?: typeof fetch;
  start?: (options: AgentSessionOptions) => Promise<SilentSession>;
  startupTimeoutMs?: number;
  turnTimeoutMs?: number;
};
type Turn = {
  input: NativeGuidanceInput;
  signal: AbortSignal;
  controller: AbortController;
  onAbort: () => void;
  resolve: (reply: NativeGuidanceReply) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  parts: Map<string, { text: string; final: boolean }>;
  turnId?: string;
  sent: boolean;
  cancelled: boolean;
  settled: boolean;
};
const aborted = () => new DOMException("The guidance request was cancelled.", "AbortError");
const unavailable = () => new TutorError("Reply suggestions are unavailable right now. You can keep speaking.");
const contextKey = (input: NativeGuidanceContext) => JSON.stringify([input.language, input.level, input.topic, input.tutor]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
}
function sessionToken(value: unknown): SessionToken {
  const token = record(value);
  if (token.transport !== "livekit" || typeof token.session_id !== "string" || !token.session_id ||
      typeof token.expires_at !== "string" || typeof token.token !== "string" || !token.token ||
      typeof token.livekit_url !== "string" || !token.livekit_url.startsWith("wss://") ||
      token.max_duration_seconds !== 600) throw unavailable();
  return value as SessionToken;
}
function closedJson(text: string) {
  let depth = 0, quoted = false, escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") depth++;
    else if ((character === "}" || character === "]") && --depth <= 0) return true;
  }
  return false;
}

/** Warm once per lesson; cancelled callers drain silently without losing the connection. */
export function createNativeGuidance(dependencies: Dependencies = {}) {
  const request = dependencies.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const start = dependencies.start ?? (async (options: AgentSessionOptions) => {
    const { AgentSession } = await import("@fishaudio/agent-client");
    return AgentSession.start(options);
  });
  const lifetime = new AbortController();
  let closed = false;
  let key: string | undefined;
  let session: SilentSession | undefined;
  let endToken: string | undefined;
  let warming: Promise<void> | undefined;
  let rejectWarm: ((error: Error) => void) | undefined;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let detachLifetime: (() => void) | undefined;
  let active: Turn | undefined;
  const queue: Turn[] = [];
  const retired = new Set<string>();
  const completed = new Set<string>();
  const endedSessions = new WeakSet<SilentSession>();
  let serverEnd: Promise<void> | undefined;

  function remember(set: Set<string>, value: string, maximum: number) {
    set.add(value);
    while (set.size > maximum) set.delete(set.values().next().value!);
  }
  function endServer() {
    if (!endToken) return Promise.resolve();
    serverEnd ??= Promise.resolve().then(() => request("/api/agent/end", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endToken }),
      signal: AbortSignal.timeout(5000), keepalive: true,
    })).then(() => {}, () => {});
    return serverEnd;
  }
  async function endSession(current: SilentSession) {
    if (endedSessions.has(current)) return;
    endedSessions.add(current);
    try { current.setOutputVolume(0); } catch {}
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => current.end()).catch(() => {}),
        new Promise<void>((resolve) => { timer = setTimeout(resolve, 5000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  function settle(turn: Turn, error?: Error, reply?: NativeGuidanceReply) {
    if (turn.settled) return;
    turn.settled = true;
    turn.signal.removeEventListener("abort", turn.onAbort);
    if (error) turn.reject(error);
    else if (reply) turn.resolve(reply);
  }
  function release(turn: Turn) {
    clearTimeout(turn.timer);
    turn.controller.abort();
    for (const id of turn.parts.keys()) remember(retired, id, 2048);
    if (turn.turnId) remember(completed, turn.turnId, 128);
    if (active === turn) active = undefined;
    const index = queue.indexOf(turn);
    if (index >= 0) queue.splice(index, 1);
    queueMicrotask(pump);
  }
  function shutdown(error: Error = aborted()) {
    if (!closed) {
      closed = true;
      lifetime.abort();
      clearTimeout(startupTimer); clearTimeout(expiryTimer);
      detachLifetime?.();
      rejectWarm?.(error); rejectWarm = undefined;
      for (const turn of [...(active ? [active] : []), ...queue]) {
        settle(turn, error); release(turn);
      }
    }
    return Promise.all([session ? endSession(session) : Promise.resolve(), endServer()]).then(() => {});
  }
  function fail(cause: unknown) {
    return shutdown(cause instanceof TutorError ? cause : unavailable());
  }
  function receive(id: string, text: string, final: boolean) {
    if (closed || retired.has(id)) return;
    const turn = active;
    if (!turn?.sent) { remember(retired, id, 2048); return; }
    try {
      const old = record(JSON.parse(text));
      if (typeof old.turnId === "string" && completed.has(old.turnId)) { remember(retired, id, 2048); return; }
    } catch {}
    const previous = turn.parts.get(id);
    turn.parts.set(id, { text, final: final || (previous?.final === true && previous.text === text) });
    const parts = [...turn.parts.values()];
    const combined = parts.map((part) => part.text).join("");
    if (combined.length > 18000 || parts.length > 128) { void fail(unavailable()); return; }
    if (parts.some((part) => !part.final) || !combined.trim()) return;
    if (!combined.trimStart().startsWith("{")) { void fail(unavailable()); return; }
    let envelope: Record<string, unknown>;
    try { envelope = record(JSON.parse(combined)); }
    catch { if (closedJson(combined)) void fail(unavailable()); return; }
    if (envelope.turnId !== turn.turnId) {
      if (typeof envelope.turnId === "string" && completed.has(envelope.turnId)) {
        for (const partId of turn.parts.keys()) remember(retired, partId, 2048);
        turn.parts.clear();
        return;
      }
      void fail(unavailable()); return;
    }
    if (Object.keys(envelope).length !== 2 || !Object.hasOwn(envelope, "reply")) { void fail(unavailable()); return; }
    try {
      const reply = validateNativeGuidanceOutput(envelope.reply, turn.input);
      if (!turn.cancelled) settle(turn, undefined, reply);
      release(turn);
    } catch (cause) { void fail(cause); }
  }

  function warm(input: NativeGuidanceContext, signal?: AbortSignal): Promise<void> {
    if (closed) return Promise.reject(unavailable());
    let context: NativeGuidanceContext;
    try { context = parseNativeGuidanceContext(input as unknown as Record<string, unknown>); }
    catch (cause) { return Promise.reject(cause); }
    if (key && key !== contextKey(context)) return Promise.reject(unavailable());
    if (signal?.aborted) { void shutdown(aborted()); return Promise.reject(aborted()); }
    if (warming) return warming;
    key = contextKey(context);
    if (signal) {
      const onAbort = () => { void shutdown(aborted()); };
      signal.addEventListener("abort", onAbort, { once: true });
      detachLifetime = () => signal.removeEventListener("abort", onAbort);
    }
    warming = new Promise<void>((resolve, reject) => {
      rejectWarm = reject;
      startupTimer = setTimeout(() => { void fail(unavailable()); }, dependencies.startupTimeoutMs ?? 30000);
      void (async () => {
        const response = await request("/api/native-guidance/session", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context), signal: lifetime.signal,
        });
        if (!response.ok) throw unavailable();
        const data = record(await response.json());
        if (typeof data.endToken === "string" && data.endToken.length > 0 && data.endToken.length <= 512) endToken = data.endToken;
        if (closed) { await endServer(); return; }
        if (!endToken) throw unavailable();
        const token = sessionToken(data.sessionToken);
        const connected = await start({
          sessionToken: token, microphone: false, wakeLock: false,
          callbacks: {
            onAgentResponseDelta: ({ segmentId, text }) => receive(segmentId, text, false),
            onAgentResponse: ({ segmentId, text }) => receive(segmentId, text, true),
            onDisconnect: () => { void fail(unavailable()); },
            onError: () => { void fail(unavailable()); },
            onToolCallStarted: () => { void fail(unavailable()); },
            onStatusChange: (state) => { if (state === "reconnecting" || state === "ended") void fail(unavailable()); },
          },
        });
        if (closed) { await endSession(connected); await endServer(); return; }
        session = connected;
        connected.setOutputVolume(0);
        clearTimeout(startupTimer);
        rejectWarm = undefined;
        expiryTimer = setTimeout(() => { void shutdown(unavailable()); }, 600000);
        resolve();
      })().catch((cause) => { void fail(cause); });
    });
    return warming;
  }

  async function prepare(turn: Turn) {
    await warm(turn.input);
    if (closed || active !== turn || turn.cancelled) return;
    const response = await request("/api/native-guidance/turn", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endToken, input: turn.input }), signal: turn.controller.signal,
    });
    if (!response.ok) throw unavailable();
    const data = record(await response.json());
    if (closed || active !== turn || turn.cancelled) return;
    if (typeof data.turnId !== "string" || !/^[a-f0-9]{32}$/.test(data.turnId) || completed.has(data.turnId) ||
        typeof data.prompt !== "string" || !data.prompt.trim() || data.prompt.length > 50000) throw unavailable();
    turn.turnId = data.turnId;
    turn.sent = true;
    session!.sendUserMessage(data.prompt, { audio: false });
  }
  function pump() {
    if (closed || active || queue.length === 0) return;
    active = queue.shift()!;
    const turn = active;
    void prepare(turn).catch((cause) => { if (!closed && active === turn) void fail(cause); });
  }
  function run(input: NativeGuidanceInput, signal: AbortSignal): Promise<NativeGuidanceReply> {
    if (closed) return Promise.reject(unavailable());
    if (signal.aborted) return Promise.reject(aborted());
    let parsed: NativeGuidanceInput;
    try { parsed = parseNativeGuidanceInput(input as unknown as Record<string, unknown>); }
    catch (cause) { return Promise.reject(cause); }
    if ((key && key !== contextKey(parsed)) || queue.length >= 1) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const turn: Turn = {
        input: parsed, signal, controller: new AbortController(), resolve, reject,
        sent: false, cancelled: false, settled: false, parts: new Map(),
        onAbort: () => {
          turn.cancelled = true;
          settle(turn, aborted());
          // Once sent, drain its correlated response before sending the next
          // task; this prevents transcript fragments from mixing across turns.
          if (!turn.sent) release(turn);
        },
        timer: setTimeout(() => {
          if (active === turn) void fail(unavailable());
          else { settle(turn, unavailable()); release(turn); }
        }, dependencies.turnTimeoutMs ?? 60000),
      };
      signal.addEventListener("abort", turn.onAbort, { once: true });
      queue.push(turn);
      pump();
    });
  }
  return { warm, run, close: () => shutdown(), getState: () => closed ? "closed" : session ? "connected" : warming ? "connecting" : "idle" };
}
