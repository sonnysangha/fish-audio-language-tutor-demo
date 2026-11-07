import { readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";

// Run from the Sona directory. Credentials and agent identifiers never print.
const envPath = resolve(".env.local");
const source = await readFile(envPath, "utf8");
const values = Object.fromEntries(source.split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^(["'])(.*)\1$/, "$2")];
}));
const key = values.FISH_AUDIO_API_KEY || values.FISH_API_KEY;
if (!key) throw new Error("Set FISH_AUDIO_API_KEY in .env.local first.");
const config = {
  prompt: { system_prompt: "You are Sona, a language-practice assistant. Follow the session instructions, return only the requested JSON, and use fictional examples. Never request personal information.", first_message_mode: "off", first_message: "", first_message_prompt: "" },
  voice: { voice_id: "9a9cf47702da476aa4629e2506d4a857", speaking_language: "en", tts_model: "s2.1-pro", expressive: true },
  asr: { model: "fish_audio:transcribe-stream-1" },
  llm: { model: "google/gemini-3.6-flash", fallback: { mode: "off" } },
  conversation: { record_audio: false, reengage_enabled: false, hangup_farewell_mode: "off", max_duration_seconds: 600 },
  tools: { enabled: false, tool_ids: [], system_tools: { hang_up_call: false } },
  knowledge_base: { enabled: false, knowledge_source_ids: [] },
  analysis: { summary: { enabled: false }, data_fields: [], criteria: [] },
  webhooks: { conversation_init: null, post_call: [] },
  context: { current_time: false },
};
async function api(path, method = "GET", body) {
  const response = await fetch(`https://api.fish.audio/v1/agent${path}`, {
    method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    // Only show schema field names, never provider bodies or credentials.
    const detail = await response.json().catch(() => null);
    const fields = Array.isArray(detail) ? detail.map((item) => item.loc?.join(".")).filter(Boolean) : [];
    throw new Error(`Fish agent setup failed: HTTP ${response.status}${fields.length ? `; fields: ${fields.join(", ")}` : ""}`);
  }
  return response.status === 204 ? {} : response.json();
}
let id = values.FISH_AUDIO_AGENT_ID;
if (!id) {
  const created = await api("/agents", "POST", { name: "Sona Language Tutor", description: "Fictional language-practice demo; private SDK sessions.", config });
  id = created.agent_id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Fish returned an unexpected agent identifier.");
  const lines = source.split(/\r?\n/).filter((line) => !/^FISH_AUDIO_AGENT_ID=/.test(line));
  await writeFile(envPath, `${lines.join("\n").trimEnd()}\nFISH_AUDIO_AGENT_ID=${id}\n`, { mode: 0o600 });
  await chmod(envPath, 0o600);
  console.log("Created private Sona agent; identifier saved to local environment.");
} else {
  await api(`/agents/${id}/config`, "PATCH", config);
  console.log("Updated existing Sona agent configuration.");
}
await api(`/agents/${id}`, "PATCH", { public_enabled: false, overrides_allowed: ["system_prompt", "language", "voice_id"] });
const draft = await api(`/agents/${id}/config`);
await api(`/agents/${id}/publish`, "POST", { version_title: "Sona SDK integration", expected_config_hash: draft.config_hash });
const [agent, verified] = await Promise.all([api(`/agents/${id}`), api(`/agents/${id}/config`)]);
if (agent.public_enabled !== false || verified.prompt?.first_message_mode !== "off" || verified.conversation?.record_audio !== false)
  throw new Error("Fish agent privacy and silent-start configuration could not be verified.");
const latest = await readFile(envPath, "utf8");
await writeFile(envPath, latest.split(/\r?\n/).filter((line) => !/^SONA_CODEX_BIN=/.test(line)).join("\n"), { mode: 0o600 });
console.log(JSON.stringify({ configured: true, private: true, greeting: "off", recordAudio: false, maxDurationSeconds: verified.conversation.max_duration_seconds, textModel: verified.llm?.model, voiceModel: verified.voice?.tts_model }));
