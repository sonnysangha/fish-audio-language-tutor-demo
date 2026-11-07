import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  nativeGuidancePrompt, nativeGuidanceSchema, parseNativeGuidanceInput, parseNativeVoiceInput,
  validateNativeGuidanceOutput,
} from "../lib/native-voice-contract";
import { endTutorSession } from "../lib/tutor";
import { TutorError } from "../lib/tutor-contract";
import { POST as nativeSession } from "../app/api/native-session/route";
import { POST as guidanceWarm } from "../app/api/native-guidance/session/route";
import { POST as guidanceTurn } from "../app/api/native-guidance/turn/route";

const lesson = { language: "fr", level: "beginner", topic: "cafe", tutor: "maya" };
const guidanceInput = { ...lesson, history: [{ role: "user", text: "Un thé, s’il vous plaît." }], text: "Avec du lait ?" };
const guidance = {
  translation: "With milk?", userTranslation: "A tea, please.", pronunciation: "Ah-vek du leh?",
  option1: { text: "Oui, merci.", meaning: "Yes, thank you.", pronunciation: "Wee, mehr-see." },
  option2: { text: "Non, merci.", meaning: "No, thank you.", pronunciation: "Nohn, mehr-see." },
  option3: { text: "Avec du lait d’avoine.", meaning: "With oat milk.", pronunciation: "Ah-vek du leh dah-vwan." },
};
const token = (id: string, duration = 600) => ({ session_id: id, expires_at: new Date(Date.now() + 600_000).toISOString(), max_duration_seconds: duration, transport: "livekit", livekit_url: "wss://fictional.example", token: "fictional-short-lived-token" });
const request = (path: string, body: unknown, origin = "http://localhost:3101") => new Request(`http://localhost:3101${path}`, {
  method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
async function configured(t: TestContext, run: () => Promise<void>) {
  const names = ["FISH_AUDIO_API_KEY", "FISH_AUDIO_AGENT_ID", "FISH_AUDIO_DRAMA_AGENT_ID", "FISH_AUDIO_NATIVE_AGENT_ID"] as const;
  const previous = names.map((name) => process.env[name]);
  names.forEach((name, index) => { process.env[name] = ["fixture-server-secret", "fixture-s21-agent", "fixture-drama-agent", "fixture-native-s21-agent"][index]; });
  try { await run(); } finally {
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
    t.mock.restoreAll();
  }
}

test("native voice inputs require a supported model and bounded guidance context", () => {
  assert.equal(parseNativeVoiceInput({ ...lesson, model: "drama-3" }).model, "drama-3");
  for (const model of [undefined, null, "s2.1-pro-free", "s2-pro", "drama3", 1])
    assert.throws(() => parseNativeVoiceInput({ ...lesson, model }), (error: unknown) => error instanceof TutorError && error.status === 400);
  assert.equal(parseNativeGuidanceInput(guidanceInput).text, guidanceInput.text);
  assert.throws(() => parseNativeGuidanceInput({ ...guidanceInput, text: "x".repeat(2001) }), TutorError);
  assert.throws(() => parseNativeGuidanceInput({ ...guidanceInput, history: Array(13).fill(guidanceInput.history[0]) }), TutorError);
});

test("native guidance validates three distinct bounded answers without adding spoken output", () => {
  assert.deepEqual(validateNativeGuidanceOutput(guidance), guidance);
  assert.ok(!JSON.stringify(nativeGuidanceSchema()).includes('"type":"array"'));
  assert.match(nativeGuidancePrompt(parseNativeGuidanceInput(guidanceInput)), /Do not add any new tutor words/);
  assert.ok(nativeGuidancePrompt(parseNativeGuidanceInput(guidanceInput)).includes(JSON.stringify(guidanceInput.text)));
  for (const invalid of [
    { ...guidance, option2: guidance.option1 },
    { ...guidance, option1: { ...guidance.option1, text: "x".repeat(121) } },
    { ...guidance, option1: { ...guidance.option1, meaning: "" } },
    { ...guidance, option1: { ...guidance.option1, pronunciation: "[happy] wee" } },
    { ...guidance, speechText: "New spoken reply." },
    { ...guidance, translation: "" },
  ]) assert.throws(() => validateNativeGuidanceOutput(invalid), TutorError);
});

test("native guidance requires the latest learner translation separately from tutor speech", () => {
  const input = parseNativeGuidanceInput(guidanceInput);
  assert.equal(validateNativeGuidanceOutput(guidance, input).userTranslation, "A tea, please.");
  const missing: Record<string, unknown> = { ...guidance };
  delete missing.userTranslation;
  assert.throws(() => validateNativeGuidanceOutput(missing, input), TutorError);
  for (const userTranslation of [null, 7, "   ", "x".repeat(2001)])
    assert.throws(() => validateNativeGuidanceOutput({ ...guidance, userTranslation }, input), TutorError);
  assert.doesNotThrow(() => validateNativeGuidanceOutput({ ...guidance, userTranslation: "x".repeat(2000) }, input));
  assert.throws(() => validateNativeGuidanceOutput({ ...guidance, userTranslation: "" }, input), /did not translate your reply/);
  const opening = { ...input, history: [] };
  assert.equal(validateNativeGuidanceOutput({ ...guidance, userTranslation: "" }, opening).userTranslation, "");
  assert.throws(() => validateNativeGuidanceOutput(guidance, opening), /unexpected learner translation/);
  assert.ok(nativeGuidanceSchema().required.includes("userTranslation"));
  const prompt = nativeGuidancePrompt(input);
  assert.match(prompt, /most recent message with role user/);
  assert.match(prompt, /Do not substitute a corrected sentence/);
  assert.match(prompt, /preserve their original words verbatim/);
  assert.equal(guidance.translation, "With milk?", "Learner translation must not replace the tutor's translation");
});

test("explicit learner text overrides older history, including an intentionally empty target", () => {
  const empty = parseNativeGuidanceInput({ ...guidanceInput, userText: "" });
  assert.equal(empty.userText, "");
  assert.equal(validateNativeGuidanceOutput({ ...guidance, userTranslation: "" }, empty).userTranslation, "");
  assert.throws(() => validateNativeGuidanceOutput(guidance, empty), /unexpected learner translation/);
  const exactText = "I would like mint tea, please.";
  const explicit = parseNativeGuidanceInput({ ...guidanceInput, userText: exactText });
  assert.equal(explicit.userText, exactText);
  assert.equal(validateNativeGuidanceOutput({ ...guidance, userTranslation: exactText }, explicit).userTranslation, exactText);
  assert.throws(() => validateNativeGuidanceOutput({ ...guidance, userTranslation: "" }, explicit), /did not translate your reply/);
  assert.ok(nativeGuidancePrompt(explicit).includes(`Exact learner message to translate as JSON data: ${JSON.stringify(exactText)}`));
  assert.ok(nativeGuidancePrompt(empty).includes('Exact learner message to translate as JSON data: ""'));
  assert.match(nativeGuidancePrompt(empty), /even if history contains older user messages/);
  for (const userText of [null, 3, " ", "x".repeat(1001)])
    assert.throws(() => parseNativeGuidanceInput({ ...guidanceInput, userText }), TutorError);
  assert.equal(parseNativeGuidanceInput({ ...guidanceInput, userText: "x".repeat(1000) }).userText?.length, 1000);
  assert.ok(!Object.hasOwn(parseNativeGuidanceInput(guidanceInput), "userText"));
});

test("native sessions select the published voice model agent and keep credentials server-side", async (t) => configured(t, async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  t.mock.method(globalThis, "fetch", (async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return String(url).endsWith("/end") ? new Response(null, { status: 204 }) : Response.json(token(`voice-${calls.length}`));
  }) as typeof fetch);
  for (const model of ["s2.1-pro", "drama-3"]) {
    const response = await nativeSession(request("/api/native-session", { ...lesson, model }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const session = await response.json();
    try {
      assert.deepEqual(Object.keys(session).sort(), ["endToken", "sessionToken"]);
      assert.ok(!JSON.stringify(session).includes("fixture-server-secret"));
      const body = calls.at(-1)!.body!;
      assert.equal(body.agent_id, model === "drama-3" ? "fixture-drama-agent" : "fixture-native-s21-agent");
      assert.equal(body.record_audio, false);
      assert.equal(body.tool_events, false);
      const overrides = body.overrides as Record<string, unknown>;
      assert.deepEqual(Object.keys(overrides).sort(), ["first_message_prompt", "language", "system_prompt", "voice_id"]);
      assert.match(String(overrides.first_message_prompt), /briefly in French/);
      assert.match(String(overrides.first_message_prompt), /exactly one simple question/);
      assert.equal(overrides.language, "fr");
      assert.match(String(overrides.system_prompt), /live spoken French conversation/);
      assert.doesNotMatch(String(overrides.system_prompt), /Match this JSON schema/);
    } finally { await endTutorSession(session.endToken); }
  }
}));

test("native voice never falls back when the selected agent is missing and closes wrong-duration sessions", async (t) => configured(t, async () => {
  let creates = 0;
  let ends = 0;
  t.mock.method(globalThis, "fetch", (async (url) => {
    if (String(url).endsWith("/end")) { ends++; return new Response(null, { status: 204 }); }
    creates++;
    return Response.json(token("wrong-duration", 90));
  }) as typeof fetch);
  delete process.env.FISH_AUDIO_DRAMA_AGENT_ID;
  assert.equal((await nativeSession(request("/api/native-session", { ...lesson, model: "drama-3" }))).status, 503);
  assert.equal(creates, 0);
  assert.equal((await nativeSession(request("/api/native-session", { ...lesson, model: "s2.1-pro" }))).status, 503);
  assert.equal(creates, 1);
  assert.equal(ends, 1);
}));

test("native endpoints reject cross-origin requests before creating sessions", async () => {
  assert.equal((await nativeSession(request("/api/native-session", { ...lesson, model: "drama-3" }, "https://elsewhere.example"))).status, 403);
});

test("persistent guidance warms one session and prepares owned correlated turns without new provider calls", async (t) => configured(t, async () => {
  let creates = 0;
  t.mock.method(globalThis, "fetch", (async (url) => {
    if (String(url).endsWith("/end")) return new Response(null, { status: 204 });
    creates++;
    return Response.json(token("persistent-guidance"));
  }) as typeof fetch);
  const response = await guidanceWarm(request("/api/native-guidance/session", lesson));
  assert.equal(response.status, 200);
  const session = await response.json();
  try {
    assert.deepEqual(Object.keys(session).sort(), ["endToken", "sessionToken"]);
    const call = (input = guidanceInput, endToken = session.endToken) => guidanceTurn(request("/api/native-guidance/turn", { endToken, input }));
    const first = await (await call()).json();
    const second = await (await call()).json();
    assert.match(first.turnId, /^[a-f0-9]{32}$/);
    assert.notEqual(first.turnId, second.turnId);
    assert.ok(first.prompt.includes(`"const":"${first.turnId}"`));
    assert.ok(first.prompt.includes('"required":["turnId","reply"]'));
    assert.equal(creates, 1);
    assert.equal((await call({ ...guidanceInput, language: "es" })).status, 409);
    assert.equal((await call(guidanceInput, "b".repeat(64))).status, 410);
    assert.equal((await guidanceTurn(request("/api/native-guidance/turn", { endToken: session.endToken, input: guidanceInput }, "https://elsewhere.example"))).status, 403);
  } finally { await endTutorSession(session.endToken); }
  assert.equal((await guidanceTurn(request("/api/native-guidance/turn", { endToken: session.endToken, input: guidanceInput }))).status, 410);
}));
