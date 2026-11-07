import assert from "node:assert/strict";
import { test } from "node:test";
import { endTutorSession, translatePhrase, tutorReply } from "../lib/tutor";
import { getTutorVoice, languageVoices } from "../lib/tutor-voices";
import { languages } from "../lib/types";

test("each supported language has two distinct documented voices without an English fallback", () => {
  assert.deepEqual(Object.keys(languageVoices).sort(), languages.map(({ id }) => id).sort());
  const ids = new Set<string>();
  for (const { id: language } of languages) {
    for (const tutor of ["maya", "leo"] as const) {
      const voice = getTutorVoice(language, tutor);
      assert.match(voice.id, /^[a-f0-9]{32}$/);
      assert.ok(voice.name.trim());
      assert.ok(voice.reason.includes("Fish Official"));
      assert.equal(voice.locale.split("-")[0], language.split("-")[0]);
      ids.add(voice.id);
    }
  }
  assert.equal(ids.size, 20);
  assert.equal(getTutorVoice("ar", "maya").locale, "ar-SA");
  assert.equal(getTutorVoice("ar", "leo").locale, "ar-SA");
  assert.equal(getTutorVoice("es", "maya").locale, "es-ES");
  assert.equal(getTutorVoice("es", "leo").locale, "es-ES");
});

test("Fish Agent session overrides use the same localized voice registry as speech", async () => {
  const oldKey = process.env.FISH_AUDIO_API_KEY;
  const oldAgent = process.env.FISH_AUDIO_AGENT_ID;
  const oldFetch = globalThis.fetch;
  process.env.FISH_AUDIO_API_KEY = "test-credential";
  process.env.FISH_AUDIO_AGENT_ID = "fictional-agent";
  let created = 0;
  let ended = 0;
  try {
    for (const { id: language } of languages) {
      for (const tutor of ["maya", "leo"] as const) {
        globalThis.fetch = async (url, init) => {
          if (String(url).endsWith("/end")) {
            ended++;
            return new Response(null, { status: 204 });
          }
          assert.equal(url, "https://api.fish.audio/v1/agent/sessions");
          const body = JSON.parse(String(init?.body));
          assert.equal(body.overrides.voice_id, getTutorVoice(language, tutor).id);
          assert.equal(body.overrides.language, language.split("-")[0]);
          created++;
          return Response.json({
            session_id: `fictional-${language}-${tutor}`,
            expires_at: "2030-01-01T00:00:00Z",
            max_duration_seconds: 90,
            transport: "livekit",
            livekit_url: "wss://fictional.example",
            token: "fictional-token",
          });
        };
        const session = await tutorReply({ language, tutor, level: "beginner", topic: "cafe", history: [] });
        await endTutorSession(session.endToken);
        if (tutor === "maya") {
          const translation = await translatePhrase({ language, text: "A coffee, please." });
          await endTutorSession(translation.endToken);
        }
      }
    }
    assert.equal(created, 30);
    assert.equal(ended, 30);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FISH_AUDIO_API_KEY;
    else process.env.FISH_AUDIO_API_KEY = oldKey;
    if (oldAgent === undefined) delete process.env.FISH_AUDIO_AGENT_ID;
    else process.env.FISH_AUDIO_AGENT_ID = oldAgent;
  }
});
