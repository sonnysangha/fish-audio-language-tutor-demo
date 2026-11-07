"use client";

import type { AgentSession, AgentSessionOptions, SessionToken } from "@fishaudio/agent-client";
import { parseTutorInput, processWireOutput, TutorError, validateTutorOutput, validateTutorTurn } from "./tutor-contract";
import type { TranslationReply, TutorReply } from "./types";

type TextSession = Pick<AgentSession, "sendUserMessage" | "setOutputVolume" | "end">;
type StartSession = (options: AgentSessionOptions) => Promise<TextSession>;
const MAX_REPLY_LENGTH = 16000;

function cancelled(signal: AbortSignal) {
  return signal.reason instanceof TutorError
    ? signal.reason
    : new DOMException("The request was cancelled.", "AbortError");
}

function hasClosedJsonObject(text: string) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === "{" || character === "[") depth++;
    else if (character === "}" || character === "]") {
      depth--;
      if (depth <= 0) return true;
    }
  }
  return false;
}

/** One isolated text turn; late connections are closed after cancellation too. */
export function runTextOnlySession(
  start: StartSession,
  sessionToken: SessionToken,
  prompt: string,
  signal: AbortSignal,
  kind: "tutor" | "translation",
): Promise<string> {
  return new Promise((resolve, reject) => {
    let session: TextSession | undefined;
    let settled = false;
    let sent = false;
    const segments = new Map<string, string>();
    const close = (current: TextSession) => {
      try { current.setOutputVolume(0); } catch {}
      try { void current.end().catch(() => {}); } catch {}
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (session) close(session);
      reject(error);
    };
    const onAbort = () => fail(cancelled(signal));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    void Promise.resolve().then(() => {
      if (signal.aborted) throw cancelled(signal);
      return start({
        sessionToken,
        microphone: false,
        wakeLock: false,
        callbacks: {
          onAgentResponseDelta: ({ segmentId, text }) => {
            const priorLength = [...segments].reduce((length, [id, part]) => length + (id === segmentId ? 0 : part.length), 0);
            if (sent && priorLength + text.length > MAX_REPLY_LENGTH)
              fail(new TutorError("The tutor returned an oversized reply. Please try again."));
          },
          onAgentResponse: ({ segmentId, text }) => {
            if (settled || !sent) return;
            segments.set(segmentId, text);
            const reply = [...segments.values()].join("");
            if (!reply.trim()) return;
            if (!reply.trim().startsWith("{") || reply.length > MAX_REPLY_LENGTH) {
              fail(new TutorError("The tutor returned an incomplete reply. Please try again."));
              return;
            }
            // One response may arrive as several finalized transcript segments.
            // Keep exact text while waiting for the complete structured reply.
            let parsed: unknown;
            try { parsed = JSON.parse(reply); } catch {
              // Finalized segments may still be only part of a JSON object.
              // Once the outer object has closed, more text cannot repair it.
              if (hasClosedJsonObject(reply))
                fail(new TutorError("The tutor returned an invalid reply. Please try again."));
              return;
            }
            let canonical: TutorReply | TranslationReply;
            try {
              canonical = kind === "tutor"
                ? processWireOutput(parsed, "tutor")
                : processWireOutput(parsed, "translation");
            } catch (cause) {
              fail(cause instanceof TutorError ? cause : new TutorError("The tutor returned an incomplete reply. Please try again."));
              return;
            }
            settled = true;
            signal.removeEventListener("abort", onAbort);
            if (session) close(session);
            resolve(JSON.stringify(canonical));
          },
          onDisconnect: () => fail(new TutorError("The tutor connection ended before replying. Please try again.")),
          onError: () => fail(new TutorError("The tutor connection could not complete this reply. Please try again.")),
          onToolCallStarted: () => fail(new TutorError("The tutor attempted an unsupported action. Please try again.")),
        },
      });
    }).then((connected) => {
      session = connected;
      if (settled || signal.aborted) { close(connected); return; }
      // The private agent has no greeting and these turns never request TTS.
      connected.setOutputVolume(0);
      sent = true;
      connected.sendUserMessage(prompt, { audio: false });
    }).catch(() => {
      fail(signal.aborted ? cancelled(signal) : new TutorError("The tutor connection could not start. Please try again."));
    });
  });
}

function sessionTokenFrom(value: unknown): SessionToken {
  if (!value || typeof value !== "object") throw new TutorError("The tutor connection was incomplete. Please try again.");
  const token = value as Record<string, unknown>;
  if (token.transport !== "livekit" || typeof token.session_id !== "string" ||
      typeof token.expires_at !== "string" || typeof token.max_duration_seconds !== "number" ||
      typeof token.livekit_url !== "string" || typeof token.token !== "string")
    throw new TutorError("The tutor connection was incomplete. Please try again.");
  return value as SessionToken;
}

export function runFishAgentRequest(path: "/api/tutor", input: unknown, signal: AbortSignal, kind: "tutor"): Promise<TutorReply>;
export function runFishAgentRequest(path: "/api/translate", input: unknown, signal: AbortSignal, kind: "translation"): Promise<TranslationReply>;
export async function runFishAgentRequest(
  path: "/api/tutor" | "/api/translate",
  input: unknown,
  signal: AbortSignal,
  kind: "tutor" | "translation",
): Promise<TutorReply | TranslationReply> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new TutorError("The tutor took too long to reply. Please try again.")), 60000);
  const requestSignal = AbortSignal.any([signal, deadline.signal]);
  let endToken: string | undefined;
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: requestSignal,
    });
    if (!response.ok) {
      const message = response.status === 402
        ? "Fish Audio credits are needed to start the tutor. Check your Fish Audio balance."
        : response.status === 401 || response.status === 403
          ? "Fish Audio access needs attention. Check the tutor's connection settings."
          : response.status === 429
            ? "The tutor is busy. Please try again in a moment."
            : response.status === 503
              ? "The Fish Audio tutor needs its connection settings checked before you can start."
              : "The tutor connection is unavailable. Please try again.";
      throw new TutorError(message, response.status);
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") throw new TutorError("The tutor connection was incomplete. Please try again.");
    const bootstrap = data as Record<string, unknown>;
    if (typeof bootstrap.endToken === "string" && bootstrap.endToken.length <= 512)
      endToken = bootstrap.endToken;
    if (!endToken || typeof bootstrap.prompt !== "string" || !bootstrap.prompt.trim() || bootstrap.prompt.length > 50000)
      throw new TutorError("The tutor connection was incomplete. Please try again.");
    const sessionToken = sessionTokenFrom(bootstrap.sessionToken);
    const { AgentSession } = await import("@fishaudio/agent-client");
    const text = await runTextOnlySession((options) => AgentSession.start(options), sessionToken, bootstrap.prompt, requestSignal, kind);
    let reply: unknown;
    try { reply = JSON.parse(text); }
    catch { throw new TutorError("The tutor returned an incomplete reply. Please try again."); }
    return kind === "tutor"
      ? validateTutorTurn(reply, parseTutorInput(input as Record<string, unknown>))
      : validateTutorOutput(reply, "translation");
  } catch (cause) {
    if (requestSignal.aborted) throw cancelled(requestSignal);
    if (cause instanceof TutorError) throw cause;
    throw new TutorError("The tutor connection could not complete this reply. Please try again.");
  } finally {
    clearTimeout(timer);
    if (endToken) {
      // Separate from the cancelled turn so server cleanup can still finish.
      await fetch("/api/agent/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endToken }),
        signal: AbortSignal.timeout(5000),
        keepalive: true,
      }).catch(() => {});
    }
  }
}
