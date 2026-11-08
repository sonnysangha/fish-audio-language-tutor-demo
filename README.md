# Fish Audio Language Tutor Demo

**Sona** is a language-practice app built with Next.js and Fish Audio. It combines guided lessons, phrase translation and a continuous voice conversation, with editable emotion cues and language-matched voices.

## What you can try

- **Conversation (turns):** choose a language, topic, difficulty and guide. Type or record a reply, receive a correction when needed, and practise with suggested answers.
- **Translate:** type or speak a phrase, translate it, edit inline delivery cues and listen. Press **Enter** to translate or **Shift+Enter** for a new line.
- **Continuous chat:** keep a Fish Agent voice session connected while you talk. Pause the microphone or end the session at any time. English meanings and suggested replies are generated alongside the conversation.

The app includes Spanish, French, Italian, German, Portuguese, Japanese, Korean, Mandarin, Arabic and English. Maya and Leo are guide personas; each language uses a corresponding public Fish Audio voice.

## Run locally

### 1. Install

Use Node.js 22 or later and npm.

```sh
git clone https://github.com/sonnysangha/fish-audio-language-tutor-demo.git
cd fish-audio-language-tutor-demo
npm ci
cp .env.example .env.local
```

### 2. Add your Fish Audio API key

Create an API key in your [Fish Audio dashboard](https://fish.audio/app/), then set it in `.env.local`:

```dotenv
FISH_AUDIO_API_KEY=your_fish_audio_api_key
```

Use your own Fish Audio account. Agent conversations and some models require available API credits. Keep this file local: never commit it or expose the key through a `NEXT_PUBLIC_` variable.

### 3. Choose the setup for the features you need

**Text-to-speech does not require a Fish Agent.** Fish Audio's speech API converts text you already have into audio. Translation, tutor replies and live conversations use the separate **Fish Audio Agents** service. Both services belong to Fish Audio and use your Fish Audio account.

After installing the project and adding your API key, choose the appropriate setup:

| What you want to use | Agent setup commands | Required environment values |
| --- | --- | --- |
| **Standalone text-to-speech (TTS)** from text you supply | None | `FISH_AUDIO_API_KEY` |
| **Translate** or **Conversation (turns)** in this app | `node scripts/setup-fish-agent.mjs` | API key + `FISH_AUDIO_AGENT_ID` |
| **Continuous chat**, including its translations and suggestions | Both commands below | API key + all three agent IDs |

#### TTS only: skip agent setup

If you only want to generate speech from existing text, leave the agent IDs empty and skip both setup scripts. The TTS integration is in [`lib/fish.ts`](lib/fish.ts), with the app's speech endpoint in [`app/api/speech/route.ts`](app/api/speech/route.ts).

There is no separate TTS-only tab in this app. Its **Translate** and **Conversation (turns)** screens generate their text through Fish Agents, so those screens still require the next setup option. Using only the speech API does not provide translation or tutoring.

#### Translation and guided conversations: create the text agent

Run this command from the project directory:

```sh
node scripts/setup-fish-agent.mjs
```

It creates and publishes a private text agent for translations, tutor replies, corrections and suggested answers, then saves `FISH_AUDIO_AGENT_ID` in `.env.local`. The app uses the separate TTS API to speak that generated text. You can skip native voice-agent setup if you do not need Continuous chat.

#### Continuous chat: also create the native voice agents

For all three app modes, run these as two separate commands:

```sh
node scripts/setup-fish-agent.mjs
node scripts/setup-native-voice.mjs
```

The first command sets up the text agent described above. The second creates and publishes two private voice agents: one using **S2.1 Pro** and one using **Drama 3**. It saves `FISH_AUDIO_NATIVE_AGENT_ID` and `FISH_AUDIO_DRAMA_AGENT_ID` in `.env.local` without printing credentials. Continuous chat uses the selected voice agent for the live conversation and the text agent for on-screen meanings and suggestions.

These are reusable configurations in your Fish Audio account, not new agents created for every conversation. **Publishing activates their configuration; they remain private.** Normally you run setup once. If an agent identifier is already present, setup reuses that agent and may update its configuration. Use agents dedicated to this project. Native setup stops when it detects unpublished configuration changes rather than overwriting those changes.

### 4. Start the app

```sh
npm run dev
```

Open [http://127.0.0.1:3101](http://127.0.0.1:3101). Allow microphone access when you choose to record or start Continuous chat. Restart the dev server after changing environment values.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `FISH_AUDIO_API_KEY` | Required for TTS and every app mode. Server-side Fish Audio API key. |
| `FISH_AUDIO_AGENT_ID` | Required for Translate, Conversation (turns), and Continuous chat's visual guidance. Written by `setup-fish-agent.mjs`. |
| `FISH_AUDIO_NATIVE_AGENT_ID` | Required for Continuous chat with S2.1 Pro. Written by `setup-native-voice.mjs`. |
| `FISH_AUDIO_DRAMA_AGENT_ID` | Required for Continuous chat with Drama 3. Written by `setup-native-voice.mjs`. |
| `FISH_AUDIO_TRANSLATION_VOICE_ID` | Optional existing voice you own or are authorised to use for Translate playback. |

All values in `.env.example` are intentionally empty. Each person supplies their own key and creates only the agents needed for their chosen features.

To use your own cloned voice, create it in Fish Audio, add its ID to `FISH_AUDIO_TRANSLATION_VOICE_ID`, and restart the app. It will appear in Translate's **Voice** selector. No personal voice is included in this repository.

## How Fish Audio is used

| Feature | Integration |
| --- | --- |
| Translation, tutoring and suggested replies | Fish-hosted language model through `@fishaudio/agent-client`. |
| Speech playback in Translate and Conversation (turns) | Official `fish-audio` JavaScript SDK, streaming PCM audio. |
| Recorded input | Fish transcription API with `transcribe-1-pro`. |
| Continuous voice conversation | Fish Agent Web SDK with streaming microphone input and native agent audio. |
| Continuous chat's meanings and suggestions | A separate persistent, silent Fish Agent session. |
| Authentication and session cleanup | Server-side calls to the documented Fish Agent API. |

The app does not call another AI provider directly. Fish Agents host the configured language model; **S2.1 Pro is the speech model**, not the translation model. Account credentials stay on the server, while the browser receives short-lived session information.

Standard speech playback defaults to `s2.1-pro-free`. Continuous chat uses `s2.1-pro` through Fish Agents, and **Drama 3** is an alternative voice model. Free-tier TTS, Agent conversations and other models have different billing rules; check [Fish's current model information](https://docs.fish.audio/developer-guide/models-pricing/models-overview) and [Agents pricing](https://docs.fish.audio/agents/pricing) before using them. A free TTS badge does not mean the whole app is free to run.

## Emotion cues

Use the speech editor to place cues where the delivery should change:

```text
Come a little closer. [whispering] I have a secret. [laughing] You already guessed it!
```

Physical and emotional directions can be combined:

```text
[panting] [tired] I've been running...
```

The edited text is sent unchanged to speech generation. Delivery varies by model, voice and phrase; listen to the result when choosing cues. Native Continuous chat uses Fish's expressive voice pipeline, and its transcript may omit delivery markers.

## Customise

- `lib/types.ts`: languages, topics and tutor settings.
- `lib/tutor-voices.ts`: public language/voice mappings.
- `lib/tutoring-policy.ts`: correction and teaching instructions.
- `lib/voice-cues.ts`: editor cue presets.
- `lib/speech-models.ts`: explicit model allowlist.
- `scripts/setup-fish-agent.mjs`: the Fish-hosted language model and base agent configuration.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

These checks do not establish microphone quality or subjective voice performance. Test recording, interruptions and playback in your own browser as well.

## Troubleshooting

- **Translate or guided tutor needs setup:** run `node scripts/setup-fish-agent.mjs`, then restart the dev server.
- **Continuous chat needs setup:** run both agent setup commands, then restart the dev server. Its live voice and on-screen guidance require different agents.
- **Credits or connection error:** check the API key, account credits and model availability in Fish Audio. The app does not silently switch to another model or a local voice.
- **Microphone unavailable:** use localhost or HTTPS and allow microphone access. Check the selected input device and browser permissions.
- **Personal voice unavailable:** confirm the voice is accessible to the account owning the API key. Leave its environment value empty to use the included public voices.
- **Unpublished native agent edits:** review or publish those changes in Fish Audio before rerunning native setup.

## Privacy and deployment

This is a **local development demo**, bound to `127.0.0.1`. Conversation state lives in memory and is cleared by a page reload. Text and audio you submit are sent to Fish Audio. Agent audio recording is disabled by the setup scripts, but Fish may retain session records and text transcripts under its service policies. Use fictional practice content and review the provider's policies before submitting sensitive information.

Session ownership and concurrency limits are held in one Node.js process. Continuous sessions have a ten-minute limit and use two Agent connections. Before exposing the app publicly, add user authentication, per-user quotas, appropriate abuse protection and session storage suitable for your deployment. A public source repository does not make the local server a production service.

## Documentation

- [Fish Agent Web SDK](https://docs.fish.audio/agents/deploy/web-sdk)
- [Private agent sessions](https://docs.fish.audio/agents/deploy/authenticated-sessions)
- [Speech generation](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)
- [Emotion controls](https://docs.fish.audio/developer-guide/core-features/emotions)
- [Transcription](https://docs.fish.audio/api-reference/endpoint/openapi-v1/speech-to-text)

Fish Audio MCP and agent skills can help your coding assistant work with the platform, but they are optional development tools, not runtime dependencies of this app. See the [MCP guide](https://docs.fish.audio/overview/mcp) for setup.
