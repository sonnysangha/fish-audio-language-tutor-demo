import { chmod, readFile, writeFile } from "node:fs/promises";

// Provision private native-voice variants without changing the structured tutor.
// Only configuration summaries are printed; credentials and identifiers stay local.
const envPath = ".env.local";
const source = await readFile(envPath, "utf8");
const env = Object.fromEntries(source.split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^(["'])(.*)\1$/, "$2")];
}));
const key = env.FISH_AUDIO_API_KEY || env.FISH_API_KEY;
if (!key || !env.FISH_AUDIO_AGENT_ID) throw new Error("Configure the existing Fish tutor first.");

async function api(path, method = "GET", body) {
  const response = await fetch(`https://api.fish.audio/v1/agent${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Fish configuration request failed (HTTP ${response.status}).`);
  return response.status === 204 ? {} : response.json();
}

const original = await api(`/agents/${env.FISH_AUDIO_AGENT_ID}/config`);
for (const [environmentName, model] of [["FISH_AUDIO_NATIVE_AGENT_ID", "s2.1-pro"], ["FISH_AUDIO_DRAMA_AGENT_ID", "drama-3"]]) {
let id = env[environmentName];
if (!id) {
  const config = {
    prompt: {
      system_prompt: "You are Sona, an expressive language tutor. Have a natural spoken conversation, one short question at a time. Follow the lesson instructions for language and difficulty. Use fictional examples and never request personal information. Never speak JSON or technical instructions.",
      first_message_mode: "prompt", first_message: "", first_message_prompt: "Greet the learner briefly in the lesson language and ask one simple question about the lesson topic. Follow the session system prompt.",
    },
    voice: { voice_id: original.voice.voice_id, speaking_language: "en", tts_model: model, expressive: true },
    asr: { model: "fish_audio:transcribe-stream-1" },
    llm: original.llm,
    conversation: {
      record_audio: false, reengage_enabled: false, hangup_farewell_mode: "off",
      max_duration_seconds: 600, response_wait_ms: 550, interruptible: true,
      interruption_sensitivity: "balanced",
    },
    tools: { enabled: false, tool_ids: [], system_tools: { hang_up_call: false } },
    knowledge_base: { enabled: false, knowledge_source_ids: [] },
    analysis: { summary: { enabled: false }, data_fields: [], criteria: [] },
    webhooks: { conversation_init: null, post_call: [] },
    context: { current_time: false },
  };
  const created = await api("/agents", "POST", {
    name: `Sona Live Voice - ${model === "drama-3" ? "Drama 3" : "S2.1 Pro"}`,
    description: "Private fictional language-practice demo with native continuous voice.",
    config,
  });
  id = created.agent_id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Unexpected Fish agent identifier.");
  const latest = await readFile(envPath, "utf8");
  await writeFile(envPath, `${latest.trimEnd()}\n${environmentName}=${id}\n`, { mode: 0o600 });
  await chmod(envPath, 0o600);
}
  const agentId = id;
  await api(`/agents/${id}`, "PATCH", {
    public_enabled: false, overrides_allowed: ["system_prompt", "first_message", "language", "voice_id"],
  });
  const before = await api(`/agents/${id}/config`);
  const versions = await api(`/agents/${id}/versions`);
  const prior = versions.versions.reduce((a, b) => !a || b.version_number > a.version_number ? b : a, undefined);
  if (prior && before.config_hash !== prior.config_hash)
    throw new Error("There are unpublished native agent edits; review those before updating the greeting.");
  if (before.prompt?.first_message_mode !== "prompt") {
    await api(`/agents/${id}/config`, "PATCH", { prompt: {
      first_message_mode: "prompt", first_message: "",
      first_message_prompt: "Greet the learner briefly in the lesson language and ask one simple question about the lesson topic. Follow the session system prompt.",
    } });
  }
  const draft = await api(`/agents/${id}/config`);
  if (!prior || draft.config_hash !== prior.config_hash)
    await api(`/agents/${id}/publish`, "POST", {
      version_title: "Native continuous voice with agent greeting", expected_config_hash: draft.config_hash,
    });
  const [agent, history] = await Promise.all([api(`/agents/${agentId}`), api(`/agents/${agentId}/versions`)]);
  const latest = history.versions.reduce((a, b) => !a || b.version_number > a.version_number ? b : a, undefined);
  if (!latest) throw new Error("The voice agent needs publishing.");
  const snapshot = await api(`/agents/${agentId}/versions/${latest.version_number}`);
  const config = snapshot.config ?? snapshot;
  if (agent.public_enabled !== false || config.voice?.tts_model !== model || config.voice?.expressive !== true ||
      config.asr?.model !== "fish_audio:transcribe-stream-1" || config.conversation?.record_audio !== false ||
      config.conversation?.interruptible !== true || config.conversation?.max_duration_seconds !== 600 ||
      config.prompt?.first_message_mode !== "prompt") throw new Error("Native voice configuration did not pass verification.");
  console.log(JSON.stringify({ model, private: true, expressive: true, agentGreeting: true, streamingRecognition: true, interruptible: true, recordAudio: false, maxDurationSeconds: 600, published: true }));
}
