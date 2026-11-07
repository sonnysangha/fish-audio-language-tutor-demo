import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import type { AgentSessionOptions } from "@fishaudio/agent-client";
import { createNativeGuidance } from "../lib/native-guidance-client";
import type { NativeGuidanceInput } from "../lib/native-voice-contract";

const context = { language: "fr", level: "beginner", topic: "cafe", tutor: "maya" } as const;
const input: NativeGuidanceInput = { ...context, history: [], text: "Avec du lait ?" };
const reply = {
  translation: "With milk?", userTranslation: "", pronunciation: "Ah-vek du leh?",
  option1: { text: "Oui, merci.", meaning: "Yes, thank you.", pronunciation: "Wee mehr-see." },
  option2: { text: "Non, merci.", meaning: "No, thank you.", pronunciation: "Nohn mehr-see." },
  option3: { text: "Du lait d’avoine.", meaning: "Oat milk.", pronunciation: "Du leh dah-vwan." },
};
const bootstrap = {
  endToken: "a".repeat(64),
  sessionToken: { session_id: "fictional", expires_at: "2030-01-01T00:00:00Z", max_duration_seconds: 600, transport: "livekit", livekit_url: "wss://fictional.example", token: "fictional-token" },
};

function harness(turnTimeoutMs = 1000) {
  const requests: string[] = [];
  const starts: AgentSessionOptions[] = [];
  const sends: string[] = [];
  let ends = 0;
  let nextTurn = 0;
  const client = createNativeGuidance({
    turnTimeoutMs,
    fetch: async (path) => {
      requests.push(String(path));
      if (path === "/api/native-guidance/session") return Response.json(bootstrap);
      if (path === "/api/native-guidance/turn") {
        const turnId = (++nextTurn).toString(16).padStart(32, "0");
        return Response.json({ turnId, prompt: turnId });
      }
      assert.equal(path, "/api/agent/end");
      return new Response(null, { status: 204 });
    },
    start: async (options) => {
      starts.push(options);
      return {
        setOutputVolume(volume) { assert.equal(volume, 0); },
        sendUserMessage(prompt, options) { assert.deepEqual(options, { audio: false }); sends.push(prompt); },
        async end() { ends++; },
      };
    },
  });
  const emit = (turn: number, id = `segment-${turn}`) => starts[0].callbacks?.onAgentResponse?.({
    segmentId: id, text: JSON.stringify({ turnId: sends[turn - 1], reply }),
  });
  return { client, requests, starts, sends, emit, ends: () => ends };
}

test("guidance warms silently once and reuses its connection for two correlated replies", async () => {
  const h = harness();
  try {
    await h.client.warm(context);
    assert.equal(h.starts.length, 1);
    assert.equal(h.starts[0].microphone, false);
    assert.equal(h.starts[0].wakeLock, false);
    assert.equal(h.sends.length, 0);
    const first = h.client.run(input, new AbortController().signal);
    await setImmediate(); h.emit(1);
    assert.deepEqual(await first, reply);
    const second = h.client.run({ ...input, text: "Un grand café ?" }, new AbortController().signal);
    await setImmediate(); h.emit(2);
    assert.deepEqual(await second, reply);
    assert.equal(h.starts.length, 1);
    assert.equal(h.requests.filter((path) => path.endsWith("/session")).length, 1);
    assert.equal(h.requests.filter((path) => path.endsWith("/turn")).length, 2);
    assert.notEqual(h.sends[0], h.sends[1]);
    assert.equal(h.ends(), 0);
  } finally { await h.client.close(); }
  assert.equal(h.ends(), 1);
});

test("cancelled guidance drains its old reply without closing or replacing the next result", async () => {
  const h = harness();
  const controller = new AbortController();
  try {
    const first = h.client.run(input, controller.signal);
    await setImmediate();
    controller.abort();
    await assert.rejects(first, { name: "AbortError" });
    const second = h.client.run(input, new AbortController().signal);
    await setImmediate();
    assert.equal(h.sends.length, 1, "Do not mix an unfinished old transcript with a new request");
    h.emit(1);
    await setImmediate();
    assert.equal(h.sends.length, 2);
    h.emit(1, "late-old-complete-reply");
    h.emit(2);
    assert.deepEqual(await second, reply);
    assert.equal(h.starts.length, 1);
    assert.equal(h.ends(), 0);
  } finally { await h.client.close(); }
});

test("partial guidance JSON waits for its remaining finalized segments", async () => {
  const h = harness();
  try {
    const result = h.client.run(input, new AbortController().signal);
    await setImmediate();
    const json = JSON.stringify({ turnId: h.sends[0], reply });
    h.starts[0].callbacks?.onAgentResponse?.({ segmentId: "part1", text: json.slice(0, 70) });
    h.starts[0].callbacks?.onAgentResponse?.({ segmentId: "part2", text: json.slice(70) });
    assert.deepEqual(await result, reply);
  } finally { await h.client.close(); }
});

test("persistent guidance does not silently omit a supplied learner's English translation", async () => {
  const h = harness();
  const learnerInput: NativeGuidanceInput = { ...input, history: [{ role: "user", text: "Un thé, s’il vous plaît." }] };
  try {
    const result = h.client.run(learnerInput, new AbortController().signal);
    await setImmediate();
    h.emit(1);
    await assert.rejects(result, /did not translate your reply/);
  } finally { await h.client.close(); }
});

test("persistent guidance returns learner and tutor translations as separate fields", async () => {
  const h = harness();
  const learnerInput: NativeGuidanceInput = { ...input, history: [{ role: "user", text: "Un thé, s’il vous plaît." }] };
  try {
    const result = h.client.run(learnerInput, new AbortController().signal);
    await setImmediate();
    h.starts[0].callbacks?.onAgentResponse?.({ segmentId: "with-user-translation", text: JSON.stringify({
      turnId: h.sends[0], reply: { ...reply, userTranslation: "A tea, please." },
    }) });
    const value = await result;
    assert.equal(value.userTranslation, "A tea, please.");
    assert.equal(value.translation, "With milk?");
    assert.equal(h.starts.length, 1);
  } finally { await h.client.close(); }
});

test("explicit empty learner target stays empty even with older user history", async () => {
  const h = harness();
  try {
    const result = h.client.run({ ...input, userText: "", history: [{ role: "user", text: "Un thé, s’il vous plaît." }] }, new AbortController().signal);
    await setImmediate(); h.emit(1);
    assert.equal((await result).userTranslation, "");
    assert.equal(h.starts.length, 1);
  } finally { await h.client.close(); }
});

test("closing during bootstrap rejects warming and cleans up a late owned session", async () => {
  let resolve!: (response: Response) => void;
  let ends = 0;
  let starts = 0;
  const client = createNativeGuidance({
    fetch: async (path) => path === "/api/native-guidance/session"
      ? new Promise<Response>((done) => { resolve = done; })
      : (ends++, new Response(null, { status: 204 })),
    start: async () => { starts++; throw new Error("Should not start"); },
  });
  const warming = client.warm(context);
  const rejected = assert.rejects(warming, { name: "AbortError" });
  await client.close(); await rejected;
  resolve(Response.json(bootstrap));
  await setImmediate();
  assert.equal(ends, 1);
  assert.equal(starts, 0);
});

test("closing while the SDK connects mutes and ends its late connection", async () => {
  let connected!: (session: { setOutputVolume: (volume: number) => void; sendUserMessage: () => void; end: () => Promise<void> }) => void;
  let muted = 0, ended = 0, sent = 0;
  const client = createNativeGuidance({
    fetch: async (path) => path === "/api/native-guidance/session" ? Response.json(bootstrap) : new Response(null, { status: 204 }),
    start: () => new Promise((resolve) => { connected = resolve; }),
  });
  const warming = client.warm(context);
  const rejected = assert.rejects(warming, { name: "AbortError" });
  await setImmediate(); await client.close(); await rejected;
  connected({ setOutputVolume(volume) { assert.equal(volume, 0); muted++; }, sendUserMessage() { sent++; }, async end() { ended++; } });
  await setImmediate();
  assert.equal(muted, 1); assert.equal(ended, 1); assert.equal(sent, 0);
});

test("unknown correlation and turn timeout safely close only the guidance session", async () => {
  const h = harness();
  const result = h.client.run(input, new AbortController().signal);
  await setImmediate();
  h.starts[0].callbacks?.onAgentResponse?.({ segmentId: "wrong", text: JSON.stringify({ turnId: "f".repeat(32), reply }) });
  await assert.rejects(result, /You can keep speaking/);
  await h.client.close();
  assert.equal(h.ends(), 1);
  const timed = harness(15);
  await assert.rejects(timed.client.run(input, new AbortController().signal), /You can keep speaking/);
  await timed.client.close();
  assert.equal(timed.ends(), 1);
});
