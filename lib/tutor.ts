import { randomBytes } from "node:crypto";
import { getTutorVoice } from "./tutor-voices";
import {
  outputSchema, translationPrompt, tutorInstructions, tutorPrompt, TutorError,
  type FishAgentSessionToken, type TranslationInput, type TutorInput, type TutorSession,
} from "./tutor-contract";
import {
  nativeGuidanceInstructions, nativeGuidancePrompt, nativeGuidanceSchema, nativeFirstMessagePrompt,
  nativeVoiceInstructions, type NativeGuidanceInput, type NativeGuidanceContext, type NativeVoiceInput,
} from "./native-voice-contract";

const API_ORIGIN = "https://api.fish.audio";
const SESSION_LIFETIME_MS = 90_000;
const CONTINUOUS_SESSION_LIFETIME_MS = 600_000;
const MAX_ACTIVE_SESSIONS = 4;

type SessionRecord = {
  sessionId: string;
  expiresAt: number;
  kind: "tutor" | "translation" | "native-voice" | "persistent-guidance";
  tutorContext?: string;
  closing?: boolean;
  timer?: ReturnType<typeof setTimeout>;
  ending?: Promise<void>;
  cleanupAttempts: number;
};
type Registry = { pending: number; sessions: Map<string, SessionRecord> };
// Route handlers may be bundled separately. Share ownership and the limiter in
// the local Node server, including across development module reloads.
const globals = globalThis as typeof globalThis & { __sonaFishSessions?: Registry };
const registry = globals.__sonaFishSessions ??= { pending: 0, sessions: new Map() };

function apiKey() {
  return process.env.FISH_AUDIO_API_KEY || process.env.FISH_API_KEY;
}

export function isTutorReady() {
  return Boolean(apiKey() && process.env.FISH_AUDIO_AGENT_ID?.trim());
}

function scheduleCleanup(endToken: string, record: SessionRecord, delay: number) {
  if (record.timer) clearTimeout(record.timer);
  record.timer = setTimeout(() => { void closeSession(endToken).catch(() => {}); }, delay);
  record.timer.unref();
}

async function closeSession(endToken: string): Promise<void> {
  const record = registry.sessions.get(endToken);
  if (!record) return;
  if (record.ending) return record.ending;
  record.closing = true;
  record.ending = Promise.resolve().then(async () => {
    try {
      const key = apiKey();
      if (!key) throw new Error("Unavailable");
      const response = await fetch(`${API_ORIGIN}/v1/agent/sessions/${encodeURIComponent(record.sessionId)}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      await response.body?.cancel();
      if (!response.ok && response.status !== 404 && response.status !== 410)
        throw new Error("Unavailable");
      if (record.timer) clearTimeout(record.timer);
      registry.sessions.delete(endToken);
    } catch {
      record.cleanupAttempts++;
      // The published agent is also duration-capped. Retain ownership and
      // retry transient end failures so callers cannot silently abandon a call.
      if (record.cleanupAttempts <= 4) scheduleCleanup(endToken, record, 5_000);
      else if (Date.now() < record.expiresAt + 30_000)
        scheduleCleanup(endToken, record, Math.max(1, record.expiresAt + 30_000 - Date.now()));
      else {
        if (record.timer) clearTimeout(record.timer);
        registry.sessions.delete(endToken);
      }
      throw new TutorError("The session could not close yet. Please try again.", 503);
    } finally {
      record.ending = undefined;
    }
  });
  return record.ending;
}

export async function endTutorSession(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new TutorError("The session reference is invalid.", 400);
  await closeSession(value);
}

function isSessionToken(value: unknown): value is FishAgentSessionToken {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.session_id === "string" && item.session_id.length > 0 && item.session_id.length <= 256 &&
    typeof item.expires_at === "string" && Number.isFinite(Date.parse(item.expires_at)) &&
    typeof item.max_duration_seconds === "number" && item.max_duration_seconds > 0 &&
    item.transport === "livekit" && typeof item.token === "string" && item.token.length > 0 &&
    typeof item.livekit_url === "string" && /^wss:\/\//.test(item.livekit_url);
}

async function createSession(
  prompt: string, kind: "tutor" | "translation", language: string, voiceId: string, signal?: AbortSignal,
): Promise<TutorSession> {
  return createOwnedSession({
    prompt, language, voiceId, signal, kind, lifetime: SESSION_LIFETIME_MS,
    systemPrompt: `Every response must be one JSON object containing the requested tutor or translation fields.\n${tutorInstructions}\nReturn one complete JSON object with no code fences. Match this JSON schema:\n${JSON.stringify(outputSchema(kind))}\nWait silently for the first user task. After each user task, return the requested JSON response with no prose outside it.`,
  });
}

type OwnedSessionRequest = {
  prompt: string;
  systemPrompt: string;
  language: string;
  voiceId: string;
  kind: SessionRecord["kind"];
  lifetime: number;
  signal?: AbortSignal;
  tutorContext?: string;
  firstMessagePrompt?: string;
  agentEnvironment?: "FISH_AUDIO_AGENT_ID" | "FISH_AUDIO_DRAMA_AGENT_ID" | "FISH_AUDIO_NATIVE_AGENT_ID";
};

async function createOwnedSession(options: OwnedSessionRequest): Promise<TutorSession> {
  const { signal, lifetime } = options;
  if (signal?.aborted) throw new TutorError("The request was cancelled.", 499);
  const key = apiKey();
  const agentId = process.env[options.agentEnvironment ?? "FISH_AUDIO_AGENT_ID"]?.trim();
  if (!key || !agentId) throw new TutorError("The Fish Audio tutor needs setup before you can start.", 503);
  if (registry.pending + registry.sessions.size >= MAX_ACTIVE_SESSIONS)
    throw new TutorError("The tutor is busy. Please try again in a moment.", 429);
  registry.pending++;
  let endToken: string | undefined;
  try {
    // Finish accepted creation even after browser cancellation: get its id and
    // explicitly end it below. A separate timeout still bounds this request.
    const response = await fetch(`${API_ORIGIN}/v1/agent/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        record_audio: false,
        tool_events: false,
        context: { current_time: false },
        overrides: {
          language: options.language.split("-")[0],
          voice_id: options.voiceId,
          system_prompt: options.systemPrompt,
          ...(options.firstMessagePrompt ? { first_message_prompt: options.firstMessagePrompt } : {}),
        },
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 402)
        throw new TutorError("Fish Audio credits are needed to start the tutor. Check your Fish Audio balance.", 402);
      if (response.status === 429) throw new TutorError("The tutor is busy. Please try again in a moment.", 429);
      throw new TutorError("The Fish Audio tutor connection failed. Check setup and try again.", 503);
    }
    const sessionToken: unknown = await response.json();
    // Own successful responses with an id even if their transport is unusable,
    // so they can be closed instead of left running upstream.
    const sessionId = sessionToken && typeof sessionToken === "object" &&
      "session_id" in sessionToken && typeof sessionToken.session_id === "string"
      ? sessionToken.session_id : undefined;
    if (sessionId && sessionId.length <= 256) {
      endToken = randomBytes(32).toString("hex");
      const record: SessionRecord = {
        sessionId, expiresAt: Date.now() + lifetime, cleanupAttempts: 0,
        kind: options.kind,
        tutorContext: options.tutorContext,
      };
      registry.sessions.set(endToken, record);
      scheduleCleanup(endToken, record, lifetime);
    }
    if (!isSessionToken(sessionToken) || !endToken)
      throw new TutorError("The tutor returned an incomplete connection. Please try again.", 502);
    // Fish has no per-session duration override. The published agent allows
    // ten minutes; request-scoped calls still have their own 90-second cleanup.
    if (sessionToken.max_duration_seconds > CONTINUOUS_SESSION_LIFETIME_MS / 1000)
      throw new TutorError("The Fish Audio tutor needs its session limit set to ten minutes or less.", 503);
    if (lifetime === CONTINUOUS_SESSION_LIFETIME_MS && sessionToken.max_duration_seconds !== CONTINUOUS_SESSION_LIFETIME_MS / 1000)
      throw new TutorError("Continuous chat needs the Fish Audio agent's published session limit set to ten minutes.", 503);
    if (signal?.aborted) throw new TutorError("The request was cancelled.", 499);
    return { sessionToken, prompt: options.prompt, endToken };
  } catch (error) {
    if (endToken) await closeSession(endToken).catch(() => {});
    if (signal?.aborted) throw new TutorError("The request was cancelled.", 499);
    if (error instanceof TutorError) throw error;
    throw new TutorError("The Fish Audio tutor connection failed. Please try again.", 503);
  } finally {
    registry.pending--;
  }
}

export function tutorReply(input: TutorInput, signal?: AbortSignal) {
  return createSession(tutorPrompt(input), "tutor", input.language, getTutorVoice(input.language, input.tutor).id, signal);
}

export function translatePhrase(input: TranslationInput, signal?: AbortSignal) {
  return createSession(translationPrompt(input), "translation", input.language, getTutorVoice(input.language, "maya").id, signal);
}

export async function nativeVoiceSession(input: NativeVoiceInput, signal?: AbortSignal) {
  const { sessionToken, endToken } = await createOwnedSession({
    prompt: "", systemPrompt: nativeVoiceInstructions(input), firstMessagePrompt: nativeFirstMessagePrompt(input),
    language: input.language, voiceId: getTutorVoice(input.language, input.tutor).id,
    agentEnvironment: input.model === "drama-3" ? "FISH_AUDIO_DRAMA_AGENT_ID" : "FISH_AUDIO_NATIVE_AGENT_ID",
    kind: "native-voice", lifetime: CONTINUOUS_SESSION_LIFETIME_MS, signal,
  });
  return { sessionToken, endToken };
}

function guidanceContextKey(input: NativeGuidanceContext) {
  return JSON.stringify([input.language, input.level, input.topic, input.tutor]);
}

function guidanceEnvelopeSchema(turnId?: string) {
  return {
    type: "object", additionalProperties: false, required: ["turnId", "reply"],
    properties: {
      turnId: { type: "string", pattern: "^[a-f0-9]{32}$", ...(turnId ? { const: turnId } : {}) },
      reply: nativeGuidanceSchema(),
    },
  };
}

export async function persistentGuidanceSession(input: NativeGuidanceContext, signal?: AbortSignal) {
  const { sessionToken, endToken } = await createOwnedSession({
    prompt: "", language: input.language, voiceId: getTutorVoice(input.language, input.tutor).id,
    kind: "persistent-guidance", tutorContext: guidanceContextKey(input),
    lifetime: CONTINUOUS_SESSION_LIFETIME_MS, signal,
    systemPrompt: `You are a silent visual guidance service for a live language lesson. Each task is independent: use the latest quoted tutor reply and context, not an earlier task. Return exactly one JSON envelope with turnId copied from that task and reply containing the guidance fields. All guidance instructions below apply inside reply.\n${nativeGuidanceInstructions}\nMatch this JSON schema:\n${JSON.stringify(guidanceEnvelopeSchema())}\nDo not speak or send any opening message. Wait silently until a guidance task arrives.`,
  });
  return { sessionToken, endToken };
}

export function persistentGuidanceTurn(endToken: unknown, input: NativeGuidanceInput) {
  if (typeof endToken !== "string" || !/^[a-f0-9]{64}$/.test(endToken))
    throw new TutorError("The guidance session reference is invalid.", 400);
  const record = registry.sessions.get(endToken);
  if (!record || record.closing || record.expiresAt <= Date.now())
    throw new TutorError("The guidance session has ended.", 410);
  if (record.kind !== "persistent-guidance" || record.tutorContext !== guidanceContextKey(input))
    throw new TutorError("The guidance session does not match this lesson.", 409);
  const turnId = randomBytes(16).toString("hex");
  return {
    turnId,
    prompt: `${nativeGuidancePrompt(input)}\nFor this task, put that full guidance object inside reply, and copy turnId exactly as "${turnId}". This replaces any prior turnId. Return only this complete envelope, with no arrays or outside prose:\n${JSON.stringify(guidanceEnvelopeSchema(turnId))}`,
  };
}
