import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import type { AgentSessionOptions, SessionToken } from "@fishaudio/agent-client";
import { runFishAgentRequest, runTextOnlySession } from "../lib/fish-agent-client";
import { TutorError } from "../lib/tutor-contract";

const token: SessionToken = {
  transport: "livekit", session_id: "fictional-session", token: "fictional-token",
  livekit_url: "wss://fictional.example", expires_at: "2030-01-01T00:00:00Z", max_duration_seconds: 90,
};
const translation = {
  text: "Hola, ¿qué tal?",
  pronunciation: "OH-lah, keh tahl",
  meaning: "Hello, how are you?",
  note: "",
  speechText: "Hola, [warm and encouraging] ¿qué tal?",
};
const wireTranslation = {
  text: translation.text,
  pronunciation: translation.pronunciation,
  meaning: translation.meaning,
  note: translation.note,
  delivery: { before: "Hola, ", after: "¿qué tal?", emotion: "warm" },
};
const wireTranslationJson = JSON.stringify(wireTranslation);

test("Fish agent uses text-only SDK settings and closes after the final segment", async () => {
  const events: string[] = [];
  const result = await runTextOnlySession(async (options) => {
    assert.equal(options.microphone, false);
    assert.equal(options.wakeLock, false);
    assert.equal(options.sessionToken, token);
    return {
      setOutputVolume(volume) { assert.equal(volume, 0); events.push("muted"); },
      sendUserMessage(text, settings) {
        assert.equal(text, "Fictional practice prompt");
        assert.deepEqual(settings, { audio: false });
        events.push("sent");
        options.callbacks?.onAgentResponseDelta?.({ segmentId: "reply", delta: "part", text: "part" });
        options.callbacks?.onAgentResponse?.({ segmentId: "reply", text: wireTranslationJson });
      },
      async end() { events.push("ended"); },
    };
  }, token, "Fictional practice prompt", new AbortController().signal, "translation");
  assert.deepEqual(JSON.parse(result), translation);
  assert.deepEqual(events, ["muted", "sent", "muted", "ended"]);
});

test("cancelled Fish SDK connection closes when its non-cancellable start resolves late", async () => {
  const request = new AbortController();
  let connect!: (value: { setOutputVolume: () => void; sendUserMessage: () => void; end: () => Promise<void> }) => void;
  let sent = false;
  let ended = false;
  const pending = runTextOnlySession(() => new Promise((resolve) => { connect = resolve; }), token, "Fictional prompt", request.signal, "translation");
  await setImmediate();
  request.abort();
  await assert.rejects(pending, { name: "AbortError" });
  connect({
    setOutputVolume() {},
    sendUserMessage() { sent = true; },
    async end() { ended = true; },
  });
  await setImmediate();
  assert.equal(sent, false);
  assert.equal(ended, true);
});

test("Fish response preserves JSON split across finalized transcript segments", async () => {
  const result = await runTextOnlySession(async (options) => ({
    setOutputVolume() {},
    sendUserMessage() {
      options.callbacks?.onAgentResponse?.({ segmentId: "first", text: wireTranslationJson.slice(0, 16) });
      options.callbacks?.onAgentResponse?.({ segmentId: "second", text: wireTranslationJson.slice(16) });
    },
    async end() {},
  }), token, "Fictional prompt", new AbortController().signal, "translation");
  assert.deepEqual(JSON.parse(result), translation);
});

test("complete malformed JSON fails immediately and closes without retrying the translation", async () => {
  let sends = 0;
  let ends = 0;
  const result = runTextOnlySession(async (options) => ({
    setOutputVolume() {},
    sendUserMessage() {
      sends++;
      options.callbacks?.onAgentResponse?.({
        segmentId: "invalid-json",
        text: '{"text":"Hola." "meaning":"Hello.","delivery":{"segments":[]}}',
      });
    },
    async end() { ends++; },
  }), token, "Fictional translation", new AbortController().signal, "translation");
  await assert.rejects(result, /invalid reply/);
  assert.equal(sends, 1);
  assert.equal(ends, 1);
});

test("a nested closing brace and escaped quotes do not finish a partial JSON reply", async () => {
  let ends = 0;
  const wire = {
    ...wireTranslation,
    meaning: 'Hello } [ "friend", how are you?',
    delivery: { segments: [{ text: "Hola, ", emotion: null }, { text: "¿qué tal?", emotion: "warm" }] },
  };
  const json = JSON.stringify(wire);
  const split = json.indexOf("},", json.indexOf('"segments"')) + 1;
  assert.equal(json[split - 1], "}");
  const result = await runTextOnlySession(async (options) => ({
    setOutputVolume() {},
    sendUserMessage() {
      options.callbacks?.onAgentResponse?.({ segmentId: "first", text: json.slice(0, split) });
      assert.equal(ends, 0, "The outer object is still open");
      options.callbacks?.onAgentResponse?.({ segmentId: "second", text: json.slice(split) });
    },
    async end() { ends++; },
  }), token, "Fictional translation", new AbortController().signal, "translation");
  assert.deepEqual(JSON.parse(result), { ...translation, meaning: wire.meaning });
  assert.equal(ends, 1);
});

test("guided Fish tutor keeps its three reply options separate from the emotional spoken reply", async () => {
  const wireReply = {
    text: "¡Muy bien! ¿Quieres leche?",
    translation: "Very good! Would you like milk?",
    userTranslation: "A coffee, please.",
    pronunciation: "Mooy bee-EHN! KYEH-res LEH-cheh?",
    feedback: "",
    replyOptions: [
      { text: "Sí, por favor.", meaning: "Yes, please.", pronunciation: "See, por fah-VOR." },
      { text: "No, gracias.", meaning: "No, thank you.", pronunciation: "Noh, GRAH-syahs." },
      { text: "Solo un poco.", meaning: "Just a little.", pronunciation: "SOH-loh oon POH-koh." },
    ],
    emotion: "delighted",
    delivery: { before: "¡Muy bien! ", after: "¿Quieres leche?", emotion: "delighted" },
  };
  let ends = 0;
  const result = await runTextOnlySession(async (options) => ({
    setOutputVolume() {},
    sendUserMessage() {
      options.callbacks?.onAgentResponse?.({ segmentId: "guided-reply", text: JSON.stringify(wireReply) });
    },
    async end() { ends++; },
  }), token, "Fictional guided lesson", new AbortController().signal, "tutor");
  const reply = JSON.parse(result);
  assert.deepEqual(reply.replyOptions, wireReply.replyOptions);
  assert.equal(reply.speechText, "¡Muy bien! [delighted] ¿Quieres leche?");
  assert.equal(reply.emotion, "delighted");
  assert.equal(reply.userTranslation, wireReply.userTranslation);
  assert.ok(!reply.speechText.includes(reply.userTranslation));
  assert.ok(wireReply.replyOptions.every((option) => !reply.speechText.includes(option.text)));
  assert.equal(ends, 1);
});

test("Fish timeout and provider errors settle the request without leaking provider details", async () => {
  const request = new AbortController();
  let callbacks: AgentSessionOptions["callbacks"];
  let ended = 0;
  const start = async (options: AgentSessionOptions) => {
    callbacks = options.callbacks;
    return { setOutputVolume() {}, sendUserMessage() {}, async end() { ended++; } };
  };
  const pending = runTextOnlySession(start, token, "Fictional prompt", request.signal, "translation");
  await setImmediate();
  request.abort(new TutorError("The tutor took too long to reply. Please try again."));
  await assert.rejects(pending, /took too long/);
  assert.equal(ended, 1);

  const failed = runTextOnlySession(start, token, "Fictional prompt", new AbortController().signal, "translation");
  await setImmediate();
  callbacks?.onError?.(Object.assign(new Error("private provider detail"), { code: "provider_error" as const }));
  await assert.rejects(failed, (error: Error) => error.message.includes("could not complete") && !error.message.includes("private"));
  assert.equal(ended, 2);
});

test("Fish structured delivery preserves every word and adds its selected cue once", async () => {
  let starts = 0;
  let turns = 0;
  let ends = 0;
  const result = await runTextOnlySession(async (options) => {
    starts++;
    return {
      setOutputVolume() {},
      sendUserMessage(_prompt, settings) {
        turns++;
        assert.deepEqual(settings, { audio: false });
        assert.equal(ends, 0);
        options.callbacks?.onAgentResponse?.({ segmentId: `turn-${turns}`, text: wireTranslationJson });
      },
      async end() { ends++; },
    };
  }, token, "Fictional prompt", new AbortController().signal, "translation");
  const reply = JSON.parse(result);
  assert.deepEqual(reply, translation);
  assert.equal(reply.speechText.replace(/ \[[^\]]+\] /g, " "), translation.text);
  assert.equal(starts, 1);
  assert.equal(turns, 1);
  assert.equal(ends, 1);
});

test("structured delivery cannot change the translated words", async () => {
  let turns = 0;
  let ends = 0;
  const result = runTextOnlySession(async (options) => ({
    setOutputVolume() {},
    sendUserMessage() {
      turns++;
      const reply = { ...wireTranslation, delivery: { before: "Hola, ", after: "amiga.", emotion: "warm" } };
      options.callbacks?.onAgentResponse?.({ segmentId: `turn-${turns}`, text: JSON.stringify(reply) });
    },
    async end() { ends++; },
  }), token, "Fictional prompt", new AbortController().signal, "translation");
  await assert.rejects(result, TutorError);
  assert.equal(turns, 1);
  assert.equal(ends, 1);
});

test("missing structured emotion fails immediately without corrective turns", async () => {
  let turns = 0;
  let ends = 0;
  const result = runTextOnlySession(async (options) => ({
    setOutputVolume() {},
    sendUserMessage() {
      turns++;
      options.callbacks?.onAgentResponse?.({
        segmentId: `turn-${turns}`,
        text: JSON.stringify({ ...wireTranslation, delivery: { before: "Hola, ", after: "¿qué tal?" } }),
      });
    },
    async end() { ends++; },
  }), token, "Fictional prompt", new AbortController().signal, "translation");
  await assert.rejects(result, TutorError);
  assert.equal(turns, 1);
  assert.equal(ends, 1);
});

test("invalid bootstrap still ends the server session using a separate cleanup request", async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    if (url === "/api/translate")
      return Response.json({ endToken: "fictional-cleanup", prompt: "Fictional prompt", sessionToken: {} });
    assert.equal(url, "/api/agent/end");
    assert.equal(options?.keepalive, true);
    assert.equal(options?.signal?.aborted, false);
    assert.equal(options?.body, '{"endToken":"fictional-cleanup"}');
    return new Response(null, { status: 204 });
  };
  try {
    await assert.rejects(runFishAgentRequest("/api/translate", {}, new AbortController().signal, "translation"), /connection was incomplete/);
    assert.deepEqual(calls, ["/api/translate", "/api/agent/end"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
