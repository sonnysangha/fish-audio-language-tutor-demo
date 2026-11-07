import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import type { AgentSessionOptions, SessionToken } from "@fishaudio/agent-client";
import { createNativeVoice, type NativeVoiceStatus } from "../lib/native-voice-client";
import type { NativeVoiceInput } from "../lib/native-voice-contract";

const token: SessionToken = { transport: "livekit", session_id: "fictional", token: "fictional", livekit_url: "wss://fictional.example", expires_at: "2030-01-01T00:00:00Z", max_duration_seconds: 600 };
const input: NativeVoiceInput = { language: "es", level: "beginner", topic: "cafe", tutor: "maya", model: "drama-3" };
function harness() {
  let callbacks: AgentSessionOptions["callbacks"];
  const routes: string[] = [];
  const messages: [string, boolean | undefined][] = [];
  const muted: boolean[] = [];
  const volume: number[] = [];
  const states: NativeVoiceStatus[] = [];
  const modes: string[] = [];
  const transcript: [string, string, string, boolean][] = [];
  const orders: number[] = [];
  const errors: string[] = [];
  let starts = 0; let ends = 0; let unlocks = 0;
  const session = {
    sendUserMessage(text: string, options?: { audio?: boolean }) { messages.push([text, options?.audio]); callbacks?.onUserTranscript?.({ segmentId: `typed-${messages.length}`, text, final: true }); },
    setOutputVolume(value: number) { volume.push(value); },
    async setMicMuted(value: boolean) { muted.push(value); },
    async startAudio() { unlocks++; },
    async end() { ends++; callbacks?.onDisconnect?.({ reason: "user_hangup" }); },
  };
  const fetcher: typeof fetch = async (url, options) => {
    routes.push(String(url));
    if (url === "/api/agent/end") {
      assert.equal(options?.body, '{"endToken":"fictional-end"}');
      assert.equal(options?.signal?.aborted, false);
      assert.equal(options?.keepalive, true);
      return new Response(null, { status: 204 });
    }
    return Response.json({ sessionToken: token, endToken: "fictional-end", prompt: "Provide fictional guidance." });
  };
  const start = async (options: AgentSessionOptions) => {
    starts++; callbacks = options.callbacks;
    assert.equal(options.wakeLock, false); assert.deepEqual(options.sessionToken, token);
    return session;
  };
  const client = createNativeVoice({
    onStatus: (state) => states.push(state), onMode: (mode) => modes.push(mode),
    onTranscript: (id, role, text, final, metadata) => { transcript.push([id, role, text, final]); orders.push(metadata.order); },
    onError: (error) => errors.push(error.message),
  }, { fetch: fetcher, start });
  return { client, start, fetcher, session, routes, messages, muted, volume, states, modes, transcript, orders, errors,
    get callbacks() { return callbacks; }, get starts() { return starts; }, get ends() { return ends; }, get unlocks() { return unlocks; } };
}

test("native conversation starts one microphone session and never auto-mutes after a reply", async () => {
  const h = harness();
  const client = createNativeVoice({}, { fetch: h.fetcher, start: async (options) => { assert.equal(options.microphone, true); return h.start(options); } });
  await client.start(input, new AbortController().signal);
  h.callbacks?.onAgentResponse?.({ segmentId: "reply", text: "Hola, ¿quieres café?" });
  client.send("Sí, gracias.");
  h.callbacks?.onAgentResponse?.({ segmentId: "reply2", text: "¿Con leche?" });
  assert.equal(h.starts, 1); assert.deepEqual(h.muted, []);
  assert.deepEqual(h.messages, [["Sí, gracias.", true]], "The server owns the greeting; no synthetic user message races with the live microphone");
  await client.close(); await client.close();
  assert.equal(h.ends, 1); assert.equal(h.routes.filter((path) => path === "/api/agent/end").length, 1);
});

test("native transcript forwards full segment updates without injecting an opening and ignores late partials", async () => {
  const h = harness(); await h.client.start(input, new AbortController().signal);
  assert.deepEqual(h.transcript, []);
  h.callbacks?.onUserTranscript?.({ segmentId: "u", text: "Quiero", final: false });
  h.callbacks?.onUserTranscript?.({ segmentId: "u", text: "Quiero café.", final: true });
  h.callbacks?.onAgentResponseDelta?.({ segmentId: "a", text: "Hola", delta: "Hola" });
  h.callbacks?.onAgentResponseDelta?.({ segmentId: "a", text: "Hola, claro.", delta: ", claro." });
  h.callbacks?.onAgentResponse?.({ segmentId: "a", text: "Hola, claro." });
  h.callbacks?.onAgentResponse?.({ segmentId: "a", text: "Hola, claro." });
  h.callbacks?.onAgentResponseDelta?.({ segmentId: "a", text: "Hola", delta: "Hola" });
  assert.deepEqual(h.transcript, [["u", "user", "Quiero", false], ["u", "user", "Quiero café.", true], ["a", "assistant", "Hola", false], ["a", "assistant", "Hola, claro.", false], ["a", "assistant", "Hola, claro.", true]]);
  assert.deepEqual(h.orders, [0, 0, 1, 1, 1]);
  h.callbacks?.onModeChange?.("speaking"); h.callbacks?.onModeChange?.("listening");
  h.callbacks?.onStatusChange?.("reconnecting"); h.callbacks?.onStatusChange?.("connected");
  assert.deepEqual(h.modes, ["speaking", "listening"]);
  assert.deepEqual(h.states, ["connecting", "connected", "reconnecting", "connected"]);
  assert.equal(h.starts, 1);
  await h.client.close();
  h.callbacks?.onUserTranscript?.({ segmentId: "late", text: "Ignored", final: true });
  assert.equal(h.transcript.length, 5);
});

test("transcript order stays tied to first observation when earlier segments finalize late", async () => {
  const h = harness(); await h.client.start(input, new AbortController().signal);
  h.callbacks?.onAgentResponseDelta?.({ segmentId: "greeting", text: "Hola", delta: "Hola" });
  h.callbacks?.onUserTranscript?.({ segmentId: "name", text: "Carlos", final: false });
  h.callbacks?.onAgentResponseDelta?.({ segmentId: "reply", text: "Encantada", delta: "Encantada" });
  h.callbacks?.onUserTranscript?.({ segmentId: "name", text: "Me llamo Carlos.", final: true });
  h.callbacks?.onAgentResponse?.({ segmentId: "greeting", text: "Hola, ¿cómo te llamas?" });
  h.callbacks?.onAgentResponse?.({ segmentId: "reply", text: "Encantada, Carlos." });
  h.callbacks?.onAgentResponse?.({ segmentId: "followup", text: "¿De dónde eres?" });
  assert.deepEqual(h.orders, [0, 1, 2, 1, 0, 2, 3]);
  assert.deepEqual(h.transcript.at(-1), ["followup", "assistant", "¿De dónde eres?", true]);
  assert.deepEqual(h.messages, []);
  await h.client.close();
});

test("server greeting can stream during startup without an injected duplicate opening", async () => {
  const h = harness();
  const observed: [string, number][] = [];
  const client = createNativeVoice({ onTranscript: (id, _role, _text, _final, metadata) => observed.push([id, metadata.order]) }, {
    fetch: h.fetcher,
    start: async (options) => {
      options.callbacks?.onAgentResponseDelta?.({ segmentId: "server-greeting", text: "Hola", delta: "Hola" });
      options.callbacks?.onAgentResponse?.({ segmentId: "server-greeting", text: "Hola, ¿cómo te llamas?" });
      return h.start(options);
    },
  });
  await client.start(input, new AbortController().signal);
  assert.deepEqual(observed, [["server-greeting", 0], ["server-greeting", 0]]);
  assert.deepEqual(h.messages, []);
  await client.close();
});

test("only explicit mute and output controls change audio settings", async () => {
  const h = harness(); await h.client.start(input, new AbortController().signal);
  await h.client.setMuted(true); await h.client.setMuted(false);
  await h.client.setOutputEnabled(false); await h.client.setOutputEnabled(true);
  assert.deepEqual(h.muted, [true, false]); assert.deepEqual(h.volume, [1, 0, 1]); assert.equal(h.unlocks, 1);
  await assert.rejects(h.client.start(input, new AbortController().signal), /new voice connection/);
  assert.equal(h.starts, 1);
  await h.client.close();
});

test("a reconnecting native microphone can be paused but cannot resume until connected", async () => {
  const h = harness(); await h.client.start(input, new AbortController().signal);
  h.callbacks?.onStatusChange?.("reconnecting");
  await h.client.setMuted(true);
  await assert.rejects(h.client.setMuted(false), /Wait for the voice connection/);
  assert.throws(() => h.client.send("Hola."), /Wait for the voice connection/);
  assert.deepEqual(h.muted, [true]);
  h.callbacks?.onStatusChange?.("connected");
  await h.client.setMuted(false);
  assert.deepEqual(h.muted, [true, false]);
  assert.equal(h.starts, 1);
  await h.client.close();
});

test("failed audio unlock restores the prior output setting without overriding a newer toggle", async () => {
  const h = harness();
  let rejectUnlock!: (error: Error) => void;
  h.session.startAudio = () => new Promise<void>((_, reject) => { rejectUnlock = reject; });
  await h.client.start(input, new AbortController().signal);
  await h.client.setOutputEnabled(false);
  const enable = h.client.setOutputEnabled(true);
  rejectUnlock(new Error("Private browser detail"));
  await assert.rejects(enable, /Tap the audio control/);
  assert.deepEqual(h.volume, [1, 0, 1, 0]);
  const pendingEnable = h.client.setOutputEnabled(true);
  await h.client.setOutputEnabled(false);
  rejectUnlock(new Error("Late failure"));
  await assert.rejects(pendingEnable, /Tap the audio control/);
  assert.deepEqual(h.volume, [1, 0, 1, 0, 1, 0]);
  await h.client.close();
});

test("abort during SDK connection rejects promptly and closes the late native microphone session", async () => {
  const h = harness(); let connect!: (session: typeof h.session) => void;
  const client = createNativeVoice({}, { fetch: h.fetcher, start: () => new Promise((resolve) => { connect = resolve; }) });
  const abort = new AbortController(); const pending = client.start(input, abort.signal);
  await setImmediate(); abort.abort(); await assert.rejects(pending, { name: "AbortError" });
  connect(h.session); await setImmediate(); await client.close();
  assert.equal(h.ends, 1); assert.deepEqual(h.messages, []); assert.deepEqual(h.volume, [0]);
  assert.equal(h.routes.filter((path) => path === "/api/agent/end").length, 1);
});

test("cancelled native bootstrap closes a late server token without capturing the microphone", async () => {
  const h = harness(); let respond!: (response: Response) => void;
  const client = createNativeVoice({}, { start: h.start, fetch: (url, options) => url === "/api/native-session" ? new Promise((resolve) => { respond = resolve; }) : h.fetcher(url, options) });
  const abort = new AbortController(); const pending = client.start(input, abort.signal);
  abort.abort(); await assert.rejects(pending, { name: "AbortError" });
  respond(Response.json({ sessionToken: token, endToken: "fictional-end", openingMessage: "Begin." }));
  await setImmediate(); assert.equal(h.starts, 0); assert.deepEqual(h.routes, ["/api/agent/end"]);
});

test("native disconnection closes once and raw provider errors never reach callbacks", async () => {
  const h = harness(); await h.client.start(input, new AbortController().signal);
  h.callbacks?.onError?.(Object.assign(new Error("Private provider payload"), { code: "provider_error" as const }));
  await h.client.close();
  assert.equal(h.client.getStatus(), "ended"); assert.equal(h.ends, 1);
  assert.equal(h.errors.length, 1); assert.doesNotMatch(h.errors[0], /Private/);
});

test("native startup timeout and microphone denial settle with safe errors", async () => {
  const h = harness();
  const timed = createNativeVoice({}, { fetch: h.fetcher, timeoutMs: 5, start: () => new Promise(() => {}) });
  await assert.rejects(timed.start(input, new AbortController().signal), /too long/);
  await timed.close();
  const denied = createNativeVoice({}, { fetch: h.fetcher, start: async () => { throw { code: "mic_permission_denied", message: "Private detail" }; } });
  await assert.rejects(denied.start(input, new AbortController().signal), /Allow microphone/);
  await denied.close();
});
