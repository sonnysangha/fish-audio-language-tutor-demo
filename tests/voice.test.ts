import assert from "node:assert/strict";
import { test } from "node:test";
import { decode } from "@msgpack/msgpack";
import { POST as speech } from "../app/api/speech/route";
import { POST as transcribe } from "../app/api/transcribe/route";
import { GET as status } from "../app/api/status/route";
import { PcmDecoder } from "../lib/pcm";
import { generateSpeech, TranslationVoiceUnavailableError } from "../lib/fish";
import { isTranslationVoice } from "../lib/translation-voice";
import { type LanguageId, type TutorId } from "../lib/types";

const base = "http://127.0.0.1:3101";
function jsonRequest(body: unknown, origin = base) {
  return new Request(`${base}/api/speech`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
test("Fish SDK forwards exact inline cues with the selected stock voice and streams PCM", async () => {
  const oldKey = process.env.FISH_AUDIO_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.FISH_AUDIO_API_KEY = "test-credential";
  const text = "Hola, [excited] qué alegría verte. [break] ¿Cómo estás?";
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, "https://api.fish.audio/v1/tts");
    assert.equal(new Headers(init?.headers).get("model"), "s2.1-pro-free");
    assert.equal(new Headers(init?.headers).get("Content-Type"), "application/msgpack");
    assert.equal(new Headers(init?.headers).get("User-Agent"), "fish-audio");
    const body = decode(init?.body as Uint8Array) as Record<string, unknown>;
    assert.equal(body.text, text);
    assert.equal(body.reference_id, "1a04ca70dd504f63bdf314066bab8ffb");
    assert.equal(body.language, "es");
    assert.equal(body.format, "pcm");
    assert.equal(body.sample_rate, 24000);
    assert.equal(body.latency, "normal");
    assert.ok(init?.signal);
    return new Response(new Uint8Array([0, 0, 0, 64]));
  };
  try {
    const response = await speech(jsonRequest({ text, language: "es", tutor: "maya" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 0, 0, 64]);
    assert.equal((await speech(jsonRequest({ text, language: "es", tutor: "maya" }, "https://example.com"))).status, 403);
    assert.equal((await speech(jsonRequest({ text: " ", language: "es", tutor: "maya" }))).status, 400);
    assert.equal((await speech(jsonRequest({ text: "x".repeat(1001), language: "es", tutor: "maya" }))).status, 400);
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response("private upstream detail", { status: 401 });
    const error = await speech(jsonRequest({ text, language: "es", tutor: "maya" }));
    assert.equal(error.status, 502);
    assert.ok(!(await error.text()).includes("private"));
    let errorCalls = 0;
    globalThis.fetch = async () => {
      errorCalls++;
      return Response.json({ message: "private retry detail" }, { status: 503 });
    };
    assert.equal((await speech(jsonRequest({ text, language: "es", tutor: "maya" }))).status, 502);
    assert.equal(errorCalls, 1, "Billable generation must not automatically repeat");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FISH_AUDIO_API_KEY;
    else process.env.FISH_AUDIO_API_KEY = oldKey;
  }
});

test("all twenty language and tutor selections reach the Fish SDK wire with exact edited text", async () => {
  const cases: { language: LanguageId; text: string; voices: Record<TutorId, string> }[] = [
    { language: "es", text: "Hola, [warm and encouraging] qué alegría. [break] ¿Un café?", voices: { maya: "1a04ca70dd504f63bdf314066bab8ffb", leo: "b8623413606443d5b15cdb4c35ad3c9a" } },
    { language: "fr", text: "Bonjour, [calm] prenons un café. [excited] Avec plaisir !", voices: { maya: "bdfbdcb27253419ba7e0746af7a154f8", leo: "525318fedcca4948acb906f2f3a9af0d" } },
    { language: "it", text: "Ciao, [warm and encouraging] come stai? [break] Bene!", voices: { maya: "0e36e185d0654d5bac3d24331562a0cc", leo: "f6cbad8b89254774a495c088aeb7822e" } },
    { language: "de", text: "Hallo, [curious] wie geht es dir? [calm] Sehr gut.", voices: { maya: "3937b44b604249f18b94913daef94043", leo: "44f1ec96a51e429f8b87776cbc55a997" } },
    { language: "pt-BR", text: "Olá, [excited] que bom te ver! [break] Vamos conversar.", voices: { maya: "0e26d2df0d0848e3b34099bfb55fd6ea", leo: "0ffee1af32254090b3630823baade12b" } },
    { language: "ja", text: "こんにちは。[warm and encouraging]一緒に練習しましょう。[break]ありがとう。", voices: { maya: "49605213c91443e7bf6fddbf54e38890", leo: "297a6fd278df47c3b9da9bfdf55ac89a" } },
    { language: "ko", text: "안녕하세요. [calm] 같이 연습해요. [excited] 좋아요!", voices: { maya: "849c4e02d2f347bfafcbf355507f7808", leo: "117adf85c36c41a792662458db470777" } },
    { language: "zh-CN", text: "你好，[warm and encouraging]我们一起练习。[break]谢谢！", voices: { maya: "8b1b2413e55e495f82471aa2248561c3", leo: "fdc29e5149ea49c7b21c2556c5f05ce2" } },
    { language: "ar", text: "أهلاً، [calm] كيف حالك؟ [excited] بخير!", voices: { maya: "706f61d83985440499ce9c51501153a3", leo: "a4cc454c1da84ccd8d809626ce87df77" } },
    { language: "en", text: "Hello, [warm and encouraging] let's practise. [break] Ready?", voices: { maya: "9a9cf47702da476aa4629e2506d4a857", leo: "536d3a5e000945adb7038665781a4aca" } },
  ];
  const oldKey = process.env.FISH_AUDIO_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.FISH_AUDIO_API_KEY = "test-credential";
  let calls = 0;
  try {
    for (const { language, text, voices } of cases) {
      for (const tutor of ["maya", "leo"] as const) {
        globalThis.fetch = async (input, init) => {
          calls++;
          assert.equal(input, "https://api.fish.audio/v1/tts");
          assert.equal(new Headers(init?.headers).get("model"), "s2.1-pro-free");
          const body = decode(init?.body as Uint8Array) as Record<string, unknown>;
          assert.equal(body.reference_id, voices[tutor], `${language}/${tutor}`);
          assert.equal(body.language, language);
          assert.equal(body.text, text, "Must preserve exact multilingual words and inline cues");
          return new Response(new Uint8Array([0, 0, 0, 64]));
        };
        const response = await speech(jsonRequest({ text, language, tutor }));
        assert.equal(response.status, 200, `${language}/${tutor}`);
        await response.arrayBuffer();
      }
    }
    assert.equal(calls, 20);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FISH_AUDIO_API_KEY;
    else process.env.FISH_AUDIO_API_KEY = oldKey;
  }
});

test("each supported speech model reaches the SDK unchanged and unknown models never reach Fish", async () => {
  const oldKey = process.env.FISH_AUDIO_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.FISH_AUDIO_API_KEY = "test-credential";
  const models = ["s2.1-pro-free", "drama-3", "s2.1-pro", "s2-pro"] as const;
  let calls = 0;
  try {
    for (const model of models) {
      const text = model === "drama-3"
        ? "Hello, [warm and reassuring] let's practise. <emphasis>Take your time.</emphasis> [break] Ready?"
        : "Hello, [warm and encouraging] let's practise. [break] [curious] Ready?";
      globalThis.fetch = async (input, init) => {
        calls++;
        assert.equal(input, "https://api.fish.audio/v1/tts");
        assert.equal(new Headers(init?.headers).get("model"), model);
        const body = decode(init?.body as Uint8Array) as Record<string, unknown>;
        assert.equal(body.text, text, "Model selection must not rewrite words or delivery tags");
        assert.equal(body.reference_id, "9a9cf47702da476aa4629e2506d4a857");
        assert.equal(body.language, "en");
        assert.equal(body.format, "pcm");
        return new Response(new Uint8Array([0, 0, 0, 64]));
      };
      const response = await speech(jsonRequest({ text, language: "en", tutor: "maya", model }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Speech-Model"), model);
      await response.arrayBuffer();
    }
    for (const model of ["drama3", "S2.1-PRO", "s1", "", null, 7, {}]) {
      const response = await speech(jsonRequest({ text: "Hello.", language: "en", tutor: "maya", model }));
      assert.equal(response.status, 400);
    }
    assert.equal(calls, 4, "Unknown models must not silently fall back to a paid model");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FISH_AUDIO_API_KEY;
    else process.env.FISH_AUDIO_API_KEY = oldKey;
  }
});

test("paid-model credit errors are safe and never retry or fall back", async () => {
  const oldKey = process.env.FISH_AUDIO_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.FISH_AUDIO_API_KEY = "test-credential";
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get("model"), "drama-3");
    return Response.json({ message: "private account and balance detail" }, { status: 402 });
  };
  try {
    const response = await speech(jsonRequest({ text: "Hello.", language: "en", tutor: "maya", model: "drama-3" }));
    assert.equal(response.status, 402);
    const error = await response.text();
    assert.ok(error.includes("credits"));
    assert.ok(error.includes("S2.1 Pro Free"));
    assert.ok(!error.includes("private"));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FISH_AUDIO_API_KEY;
    else process.env.FISH_AUDIO_API_KEY = oldKey;
  }
});

test("personal voice uses only the server selection across models and status exposes only availability", async () => {
  const oldKey = process.env.FISH_AUDIO_API_KEY;
  const oldVoice = process.env.FISH_AUDIO_TRANSLATION_VOICE_ID;
  const oldFetch = globalThis.fetch;
  process.env.FISH_AUDIO_API_KEY = "test-credential";
  const fixtureVoice = "a".repeat(32);
  process.env.FISH_AUDIO_TRANSLATION_VOICE_ID = fixtureVoice;
  const text = "Bonjour. [whispering] C’est un secret. [laughing] Vraiment !";
  let calls = 0;
  try {
    const publicStatus = await (await status()).json();
    assert.equal(publicStatus.translationCloneReady, true);
    assert.ok(!JSON.stringify(publicStatus).includes(fixtureVoice));
    for (const model of ["s2.1-pro-free", "drama-3", "s2.1-pro", "s2-pro"] as const) {
      globalThis.fetch = async (_input, init) => {
        calls++;
        assert.equal(new Headers(init?.headers).get("model"), model);
        const body = decode(init?.body as Uint8Array) as Record<string, unknown>;
        assert.equal(body.reference_id, fixtureVoice);
        assert.equal(body.language, "fr");
        assert.equal(body.text, text);
        assert.equal(body.format, "pcm");
        return new Response(new Uint8Array([0, 0]));
      };
      const response = await speech(jsonRequest({ text, language: "fr", tutor: "leo", model, voice: "personal", reference_id: "b".repeat(32) }));
      assert.equal(response.status, 200);
      assert.ok(!JSON.stringify([...response.headers]).includes(fixtureVoice));
      await response.arrayBuffer();
    }
    for (const voice of [fixtureVoice, "custom", "", null, 1, {}, []]) {
      assert.equal(isTranslationVoice(voice), false);
      assert.equal((await speech(jsonRequest({ text, language: "fr", tutor: "leo", voice }))).status, 400);
    }
    assert.equal(calls, 4, "Invalid voice selections must not reach Fish");
    // Configuring a personal voice must not change the normal language voice.
    globalThis.fetch = async (_input, init) => {
      const body = decode(init?.body as Uint8Array) as Record<string, unknown>;
      assert.equal(body.reference_id, "525318fedcca4948acb906f2f3a9af0d");
      return new Response(new Uint8Array([0, 0]));
    };
    const normal = await speech(jsonRequest({ text, language: "fr", tutor: "leo", voice: "language" }));
    assert.equal(normal.status, 200);
    await normal.arrayBuffer();
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FISH_AUDIO_API_KEY; else process.env.FISH_AUDIO_API_KEY = oldKey;
    if (oldVoice === undefined) delete process.env.FISH_AUDIO_TRANSLATION_VOICE_ID; else process.env.FISH_AUDIO_TRANSLATION_VOICE_ID = oldVoice;
  }
});

test("missing or invalid personal voice fails safely without generating a fallback", async () => {
  const oldKey = process.env.FISH_AUDIO_API_KEY;
  const oldVoice = process.env.FISH_AUDIO_TRANSLATION_VOICE_ID;
  const oldFetch = globalThis.fetch;
  process.env.FISH_AUDIO_API_KEY = "test-credential";
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("No request should be sent"); };
  try {
    for (const configuredVoice of [undefined, "", "private invalid configuration", "g".repeat(32), "a".repeat(31), ` ${"a".repeat(32)}`]) {
      if (configuredVoice === undefined) delete process.env.FISH_AUDIO_TRANSLATION_VOICE_ID;
      else process.env.FISH_AUDIO_TRANSLATION_VOICE_ID = configuredVoice;
      assert.equal((await (await status()).json()).translationCloneReady, false);
      const response = await speech(jsonRequest({ text: "Hello.", language: "en", tutor: "maya", voice: "personal" }));
      assert.equal(response.status, 503);
      const error = await response.text();
      assert.match(error, /personal voice needs setup/);
      assert.ok(!error.includes("private"));
      if (configuredVoice) assert.ok(!error.includes(configuredVoice));
      await assert.rejects(generateSpeech("Hello.", "en", "maya", new AbortController().signal, "s2.1-pro", "personal"), TranslationVoiceUnavailableError);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FISH_AUDIO_API_KEY; else process.env.FISH_AUDIO_API_KEY = oldKey;
    if (oldVoice === undefined) delete process.env.FISH_AUDIO_TRANSLATION_VOICE_ID; else process.env.FISH_AUDIO_TRANSLATION_VOICE_ID = oldVoice;
  }
});

test("recording forwards bounded audio through the documented transcription model", async () => {
  const oldKey = process.env.FISH_AUDIO_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.FISH_AUDIO_API_KEY = "test-credential";
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://api.fish.audio/v1/asr");
    assert.equal(new Headers(init?.headers).get("model"), "transcribe-1-pro");
    const form = init?.body as FormData;
    assert.equal(form.get("language"), "pt");
    assert.equal(form.get("diarize"), "false");
    assert.deepEqual([...new Uint8Array(await (form.get("audio") as Blob).arrayBuffer())], [1, 2, 3]);
    return Response.json({ text: "Bom dia!", language_code: "pt", duration: 1 });
  };
  try {
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "practice.webm");
    form.append("language", "pt-BR");
    const response = await transcribe(new Request(`${base}/api/transcribe`, { method: "POST", headers: { Origin: base }, body: form }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).text, "Bom dia!");
    const invalid = new FormData();
    invalid.append("audio", new Blob(["script"], { type: "text/plain" }), "file.txt");
    invalid.append("language", "es");
    assert.equal((await transcribe(new Request(`${base}/api/transcribe`, { method: "POST", headers: { Origin: base }, body: invalid }))).status, 400);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FISH_AUDIO_API_KEY;
    else process.env.FISH_AUDIO_API_KEY = oldKey;
  }
});

test("stream decoder retains split 16-bit samples", () => {
  const decoder = new PcmDecoder();
  assert.deepEqual([...decoder.decode(new Uint8Array([0, 128, 255]))], [-1]);
  assert.deepEqual([...decoder.decode(new Uint8Array([127, 0, 64]))], [32767 / 32768, 0.5]);
});
