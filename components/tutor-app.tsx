"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, AudioLines,
  LoaderCircle, Mic, RefreshCw, Send, SlidersHorizontal,
  Square, X,
} from "lucide-react";
import {
  languages, MAX_TEXT_LENGTH, speechTextError, topics, tutorEmotions, tutorEmotionTags,
  type AppStatus, type HistoryMessage, type LanguageId, type Level,
  type TopicId, type TranslationReply, type TutorId, type TutorReply, type ReplyOption,
} from "@/lib/types";
import { useSpeech } from "@/components/use-speech";
import { useRecorder } from "@/components/use-recorder";
import { runFishAgentRequest } from "@/lib/fish-agent-client";
import { createNativeVoice, type NativeVoiceStatus } from "@/lib/native-voice-client";
import { createNativeGuidance } from "@/lib/native-guidance-client";
import { createNativeGuidanceQueue } from "@/lib/native-guidance-queue";
import type { NativeGuidanceReply } from "@/lib/native-voice-contract";
import { groupNativeTranscript, latestNativeGuidanceJob, nativeGuidanceJobs, nativeTranslationEntries, upsertNativeTranscript, type NativeTranscriptSegment } from "@/lib/native-transcript";
import { TutorError, type TutorInput } from "@/lib/tutor-contract";
import { TutorMessage } from "@/components/tutor-message";
import { TranslateWorkspace } from "@/components/translate-workspace";
import { LanguageGrid } from "@/components/language-grid";
import { LessonOptions } from "@/components/lesson-options";
import { TutorPicker } from "@/components/tutor-picker";
import { ReplyOptions } from "@/components/reply-options";
import { TutorPortrait, UserAvatar } from "@/components/chat-avatar";
import { VoiceLanguageSelect } from "@/components/voice-language-select";
import { DEFAULT_SPEECH_MODEL, type SpeechModelId } from "@/lib/speech-models";
import { SpeechModelSelect } from "@/components/speech-model-select";
import type { TranslationVoice } from "@/lib/translation-voice";
import { NativeVoiceChat, type NativeVoiceChatProps } from "@/components/native-voice-chat";

type Tab = "practice" | "say" | "continuous";
type Message = HistoryMessage & { id: number; language: LanguageId; reply?: TutorReply; translation?: string };
type Busy = "lesson" | "reply" | "translation" | null;
type NativeMessage = NativeVoiceChatProps["messages"][number];
const nativeSpeechModels = ["s2.1-pro", "drama-3"] as const satisfies readonly SpeechModelId[];
const tutors = [
  { id: "maya" as const, name: "Maya", description: "Warm & encouraging" },
  { id: "leo" as const, name: "Leo", description: "Calm & curious" },
];
const levels: { id: Level; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

function UserMessage({ text, translation }: { text: string; translation?: string }) {
  return <div className="chat-row user-row"><div className="message user-message"><span className="message-label">You</span><div className="user-bubble"><p className="user-text" dir="auto">{text}</p>{translation && translation.trim() !== text.trim() && <p className="user-translation" lang="en" dir="ltr">{translation}</p>}</div></div><UserAvatar /></div>;
}

export default function TutorApp() {
  const [tab, setTab] = useState<Tab>("practice");
  const [language, setLanguage] = useState<LanguageId>("es");
  const [level, setLevel] = useState<Level>("beginner");
  const [topic, setTopic] = useState<TopicId>("cafe");
  const [tutor, setTutor] = useState<TutorId>("maya");
  const [speechModel, setSpeechModel] = useState<SpeechModelId>(DEFAULT_SPEECH_MODEL);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingUser, setPendingUser] = useState("");
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [spokenReplies, setSpokenReplies] = useState(true);
  const [continuousVoice, setContinuousVoice] = useState(true);
  const [nativeStarted, setNativeStarted] = useState(false);
  const [nativeState, setNativeState] = useState<NativeVoiceStatus>("idle");
  const [nativeMode, setNativeMode] = useState<NativeVoiceChatProps["mode"]>("listening");
  const [nativeMuted, setNativeMuted] = useState(false);
  const [nativeMessages, setNativeMessages] = useState<NativeMessage[]>([]);
  const [nativeSuggestions, setNativeSuggestions] = useState<ReplyOption[]>([]);
  const [nativeGuidanceLoading, setNativeGuidanceLoading] = useState(false);
  const [nativeGuidanceError, setNativeGuidanceError] = useState("");
  const nativeVoice = useRef<ReturnType<typeof createNativeVoice> | null>(null);
  const nativeLifetime = useRef<AbortController | null>(null);
  const nativeSegmentsRef = useRef<readonly NativeTranscriptSegment[]>([]);
  const nativeTranslations = useRef(new Map<string, string>());
  const nativeGuidance = useRef<ReturnType<typeof createNativeGuidance> | null>(null);
  const nativeGuidanceQueue = useRef<ReturnType<typeof createNativeGuidanceQueue> | null>(null);
  const nativeGuidanceResults = useRef(new Map<string, NativeGuidanceReply>());
  const nativeMutedRef = useRef(false);
  const nativeMicChanging = useRef(false);
  const nativeOutputRevision = useRef(0);
  const [sourceText, setSourceText] = useState("");
  const [translationSourceLanguage, setTranslationSourceLanguage] = useState<LanguageId>("en");
  const [translationLanguage, setTranslationLanguage] = useState<LanguageId>("es");
  const [translationVoice, setTranslationVoice] = useState<TranslationVoice>("language");
  const [translation, setTranslation] = useState<TranslationReply | null>(null);
  const [playingMessage, setPlayingMessage] = useState<number | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [tutorLanguage, setTutorLanguage] = useState<LanguageId | null>(null);
  const [responseLanguage, setResponseLanguage] = useState<LanguageId | null>(null);
  const [pendingResponseLanguage, setPendingResponseLanguage] = useState<LanguageId | null>(null);
  const [responseLanguageError, setResponseLanguageError] = useState("");
  const [optionsTranslating, setOptionsTranslating] = useState(false);
  const speech = useSpeech();
  const recorder = useRecorder();
  const request = useRef<AbortController | null>(null);
  const responseLanguageRequest = useRef<AbortController | null>(null);
  const statusRequest = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const messageId = useRef(0);
  const autoVoice = useRef(true);
  const conversationLogRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const guidanceRef = useRef<HTMLDivElement | null>(null);
  const selectedLanguage = languages.find((item) => item.id === language)!;
  const selectedTutor = tutors.find((item) => item.id === tutor)!;
  const selectedTopic = topics.find((item) => item.id === topic)!;
  const working = busy !== null;
  const recording = recorder.state !== "idle";
  const lastReply = messages.at(-1)?.reply;
  const lastReplyLanguage = messages.at(-1)?.language ?? language;
  const agentLanguage = tutorLanguage ?? language;
  const learnerLanguage = responseLanguage ?? language;
  const isConversation = tab !== "say";
  const continuousChat = tab === "continuous";
  const conversationStarted = continuousChat ? nativeStarted : messages.length > 0 || busy === "lesson";
  const activeLesson = isConversation && conversationStarted;

  useLayoutEffect(() => {
    const resizeDraft = () => {
      const input = composerRef.current;
      if (!input) return;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 130) + "px";
    };
    resizeDraft();
    window.addEventListener("resize", resizeDraft);
    return () => window.removeEventListener("resize", resizeDraft);
  }, [composer, activeLesson]);

  const refreshStatus = useCallback(async () => {
    statusRequest.current?.abort();
    const controller = new AbortController();
    statusRequest.current = controller;
    setCheckingStatus(true);
    setStatusError("");
    try {
      const response = await fetch("/api/status", {
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
      });
      if (!response.ok) throw new Error("Could not check the connection.");
      const next = await response.json() as AppStatus;
      if (!controller.signal.aborted) {
        setStatus(next);
        if (!next.translationCloneReady) setTranslationVoice("language");
      }
    } catch {
      if (!controller.signal.aborted) setStatusError("We couldn’t check the connection. Try again.");
    } finally {
      if (!controller.signal.aborted) setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshStatus(), 0);
    return () => {
      window.clearTimeout(timer);
      statusRequest.current?.abort();
      request.current?.abort();
      responseLanguageRequest.current?.abort();
      sequence.current = sequence.current + 1;
      nativeGuidanceQueue.current?.close();
      nativeGuidanceQueue.current = null;
      const guidance = nativeGuidance.current;
      nativeGuidance.current = null;
      void guidance?.close();
      const connection = nativeVoice.current;
      nativeVoice.current = null;
      nativeLifetime.current?.abort();
      nativeLifetime.current = null;
      void connection?.close();
    };
  }, [refreshStatus]);

  useEffect(() => {
    const log = conversationLogRef.current;
    log?.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, [messages, pendingUser, busy, recorder.state]);

  useEffect(() => {
    if (recorder.state === "starting" || recorder.state === "recording") {
      guidanceRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [recorder.state]);

  function closeNativeGuidance() {
    nativeGuidanceQueue.current?.close();
    nativeGuidanceQueue.current = null;
    const guidance = nativeGuidance.current;
    nativeGuidance.current = null;
    setNativeGuidanceLoading(false);
    void guidance?.close();
  }

  function updateNativeGuidanceDisplay() {
    const latest = latestNativeGuidanceJob(nativeSegmentsRef.current);
    const lastGroup = groupNativeTranscript(nativeSegmentsRef.current).at(-1);
    if (lastGroup?.role === "assistant" && lastGroup.final && lastGroup.text.length > 2000) {
      setNativeSuggestions([]);
      setNativeGuidanceLoading(false);
      setNativeGuidanceError("This reply is too long for suggestions. You can keep speaking.");
      return;
    }
    const result = latest ? nativeGuidanceResults.current.get(latest.key) : undefined;
    if (result) {
      setNativeSuggestions([result.option1, result.option2, result.option3]);
      setNativeGuidanceLoading(false);
      setNativeGuidanceError("");
    } else if (latest && nativeGuidanceQueue.current?.state(latest.key) === "failed") {
      setNativeSuggestions([]);
      setNativeGuidanceLoading(false);
      setNativeGuidanceError("Reply suggestions are unavailable right now. You can keep speaking.");
    } else {
      setNativeGuidanceLoading(true);
      setNativeGuidanceError("");
    }
  }

  function publishNativeTranscript() {
    setNativeMessages(groupNativeTranscript(nativeSegmentsRef.current).map((group) => ({
      id: group.id, role: group.role, text: group.text, final: group.final,
      translation: nativeTranslations.current.get(group.signature),
    })));
  }

  function closeNativeVoice() {
    const connection = nativeVoice.current;
    nativeVoice.current = null;
    nativeLifetime.current?.abort();
    nativeLifetime.current = null;
    nativeOutputRevision.current++;
    nativeMicChanging.current = false;
    nativeMutedRef.current = false;
    closeNativeGuidance();
    setNativeStarted(false);
    setNativeState("idle");
    setNativeMode("listening");
    setNativeMuted(false);
    void connection?.close();
  }

  function cancelCurrent() {
    closeNativeVoice();
    sequence.current++;
    request.current?.abort();
    request.current = null;
    responseLanguageRequest.current?.abort();
    responseLanguageRequest.current = null;
    setPendingResponseLanguage(null);
    speech.stop();
    recorder.cancel();
    setBusy(null);
    if (pendingUser) setComposer(pendingUser);
    setPendingUser("");
    setPlayingMessage(null);
  }

  function changeContext() {
    cancelCurrent();
    setMessages([]);
    nativeSegmentsRef.current = [];
    nativeTranslations.current.clear();
    nativeGuidanceResults.current.clear();
    setNativeMessages([]);
    setNativeSuggestions([]);
    setNativeGuidanceError("");
    setSelectedOption(null);
    setTutorLanguage(null);
    setResponseLanguage(null);
    setResponseLanguageError("");
    setComposer("");
    setTranslation(null);
    setError("");
  }

  function changeTab(next: Tab) {
    if (next === tab) return;
    changeContext();
    if (next === "continuous" && speechModel !== "s2.1-pro" && speechModel !== "drama-3") setSpeechModel("s2.1-pro");
    else if (next !== "continuous" && (speechModel === "s2.1-pro" || speechModel === "s2-pro")) setSpeechModel("s2.1-pro-free");
    setTab(next);
    setError("");
  }

  function changeTutorVoiceLanguage(next: LanguageId) {
    speech.stop();
    setPlayingMessage(null);
    setTutorLanguage(next);
  }

  async function changeResponseVoiceLanguage(next: LanguageId) {
    responseLanguageRequest.current?.abort();
    responseLanguageRequest.current = null;
    setPendingResponseLanguage(null);
    setResponseLanguageError("");
    speech.stop();
    setPlayingMessage(null);
    setSelectedOption(null);
    if (next === learnerLanguage) return;
    if (!composer.trim()) { setResponseLanguage(next); return; }
    const controller = new AbortController();
    responseLanguageRequest.current = controller;
    setPendingResponseLanguage(next);
    try {
      const translated = await runFishAgentRequest("/api/translate", {
        text: composer, sourceLanguage: learnerLanguage, language: next,
      }, controller.signal, "translation");
      if (controller.signal.aborted || responseLanguageRequest.current !== controller) return;
      setComposer(translated.text);
      setResponseLanguage(next);
    } catch {
      if (!controller.signal.aborted && responseLanguageRequest.current === controller)
        setResponseLanguageError("Couldn't translate your draft. Your language and reply are unchanged. Please try again.");
    } finally {
      if (responseLanguageRequest.current === controller) {
        responseLanguageRequest.current = null;
        setPendingResponseLanguage(null);
      }
    }
  }

  async function startNativeConversation() {
    if (nativeVoice.current || !status?.fishReady || !status.tutorReady) return;
    if (speechModel !== "s2.1-pro" && speechModel !== "drama-3") {
      setError("Choose S2.1 Pro or Drama 3 to start a continuous conversation.");
      return;
    }
    cancelCurrent();
    const current = sequence.current;
    const controller = new AbortController();
    nativeLifetime.current = controller;
    nativeSegmentsRef.current = [];
    nativeTranslations.current.clear();
    nativeGuidanceResults.current.clear();
    setNativeMessages([]);
    setNativeSuggestions([]);
    setNativeGuidanceError("");
    setNativeStarted(true);
    setNativeMuted(false);
    setNativeMode("listening");
    setPreferencesOpen(false);
    setComposer("");
    setError("");

    const isCurrent = () => nativeVoice.current === connection && sequence.current === current && !controller.signal.aborted;
    const connection = createNativeVoice({
      onStatus: (next) => {
        if (!isCurrent()) return;
        setNativeState(next);
        if (next === "ended") {
          closeNativeGuidance();
          setNativeSuggestions([]);
          nativeMutedRef.current = true;
          setNativeMuted(true);
        }
      },
      onMode: (next) => { if (isCurrent()) setNativeMode(next); },
      onError: (cause) => {
        if (!isCurrent()) return;
        setError(cause instanceof TutorError ? cause.message : "The voice connection could not continue. Start a new conversation.");
      },
      onTranscript: (segmentId, role, text, final, metadata) => {
        if (!isCurrent()) return;
        const id = role + ":" + segmentId;
        const previous = nativeSegmentsRef.current;
        const nextSegments = upsertNativeTranscript(previous, { id, role, text, final, order: metadata.order });
        if (nextSegments === previous) return;
        nativeSegmentsRef.current = nextSegments;
        publishNativeTranscript();
        nativeGuidanceQueue.current?.sync(nativeGuidanceJobs(nextSegments));
      },
    });
    nativeVoice.current = connection;
    const guidanceConnection = createNativeGuidance();
    nativeGuidance.current = guidanceConnection;
    nativeGuidanceQueue.current = createNativeGuidanceQueue({
      run: async (job, signal) => {
        if (!isCurrent()) throw new DOMException("The conversation ended.", "AbortError");
        let activeGuidance = nativeGuidance.current;
        if (!activeGuidance || activeGuidance.getState() === "closed") {
          activeGuidance = createNativeGuidance();
          nativeGuidance.current = activeGuidance;
          void activeGuidance.warm({ language, level, topic, tutor }, controller.signal).catch(() => {});
        }
        return activeGuidance.run({ language, level, topic, tutor, history: job.history,
          text: job.assistant.text, userText: job.user?.text ?? "" }, signal);
      },
      onResult: (job, reply) => {
        if (!isCurrent()) return;
        for (const [signature, translation] of nativeTranslationEntries(job, reply, nativeSegmentsRef.current)) {
          nativeTranslations.current.set(signature, translation);
        }
        nativeGuidanceResults.current.set(job.key, reply);
        publishNativeTranscript();
      },
      onChange: () => { if (isCurrent()) updateNativeGuidanceDisplay(); },
    });
    // Establish the silent connection alongside voice startup, not after each reply.
    void guidanceConnection.warm({ language, level, topic, tutor }, controller.signal).catch(() => {});
    try {
      await connection.setOutputEnabled(continuousVoice);
      if (!isCurrent()) return;
      await connection.start({ language, level, topic, tutor, model: speechModel }, controller.signal);
    } catch (cause) {
      if (!isCurrent()) return;
      setError(cause instanceof TutorError ? cause.message : "The voice conversation couldn’t start. Please try again.");
    }
  }

  function sendNativeText(text: string) {
    const connection = nativeVoice.current;
    if (!connection || connection.getStatus() !== "connected") return;
    const validation = speechTextError(text);
    if (validation) { setError(validation); return; }
    try {
      setNativeGuidanceLoading(true);
      setNativeGuidanceError("");
      setError("");
      connection.send(text);
      setComposer("");
    } catch (cause) {
      setError(cause instanceof TutorError ? cause.message : "Your message couldn’t be sent. Please try again.");
    }
  }

  async function toggleNativeMicrophone() {
    const connection = nativeVoice.current;
    if (!connection || nativeMicChanging.current) return;
    const current = sequence.current;
    const muted = !nativeMutedRef.current;
    nativeMicChanging.current = true;
    try {
      await connection.setMuted(muted);
      if (nativeVoice.current !== connection || sequence.current !== current || connection.getStatus() === "ended") return;
      nativeMutedRef.current = muted;
      setNativeMuted(muted);
      setError("");
    } catch (cause) {
      if (nativeVoice.current === connection && sequence.current === current)
        setError(cause instanceof TutorError ? cause.message : "The microphone couldn’t be changed. Please try again.");
    } finally {
      if (nativeVoice.current === connection && sequence.current === current) nativeMicChanging.current = false;
    }
  }

  async function changeNativeAudio(enabled: boolean) {
    const connection = nativeVoice.current;
    const previous = continuousVoice;
    const revision = ++nativeOutputRevision.current;
    setContinuousVoice(enabled);
    if (!connection) return;
    try { await connection.setOutputEnabled(enabled); }
    catch {
      if (nativeVoice.current !== connection || revision !== nativeOutputRevision.current) return;
      void connection.setOutputEnabled(previous).catch(() => {});
      setContinuousVoice(previous);
      setError("Tap the audio control again to enable playback.");
    }
  }

  async function requestLesson(userText?: string) {
    const text = userText?.trim();
    if (tab !== "practice" || request.current || pendingResponseLanguage || !status?.tutorReady || (userText !== undefined && !text)) return;
    if (text && text.length > MAX_TEXT_LENGTH) {
      setComposer(text);
      setError("Keep your reply under 1,000 characters.");
      return;
    }
    // A typed reply also cancels microphone permission/device startup in flight.
    recorder.cancel();
    speech.stop();
    setPlayingMessage(null);
    const current = ++sequence.current;
    const controller = new AbortController();
    request.current = controller;
    const userMessage: Message | null = text ? { id: ++messageId.current, role: "user", text, language: learnerLanguage } : null;
    const nextMessages = userMessage ? [...messages, userMessage] : [];
    setPreferencesOpen(false);
    setSelectedOption(null);
    setBusy(userMessage ? "reply" : "lesson");
    setPendingUser(text ?? "");
    setComposer("");
    setError("");
    try {
      const input: TutorInput = {
        language: agentLanguage, level, topic, tutor,
        recentEmotions: messages.flatMap((message) => {
          if (message.role !== "assistant" || !message.reply) return [];
          return (message.reply.speechText.match(/\[[^\]]+\]/g) ?? []).flatMap((cue) => {
            const emotion = tutorEmotions.find((item) => tutorEmotionTags[item] === cue);
            return emotion ? [emotion] : [];
          });
        }).slice(-3),
        history: nextMessages.slice(-12).map(({ role, text: content }) => ({ role, text: content })),
      };
      const reply = await runFishAgentRequest("/api/tutor", input, controller.signal, "tutor");
      if (current !== sequence.current) return;
      const translatedMessages = nextMessages.map((message) => message.id === userMessage?.id
        ? { ...message, translation: reply.userTranslation }
        : message);
      setMessages([...translatedMessages, { id: ++messageId.current, role: "assistant", text: reply.text, language: agentLanguage, reply }]);
      if (autoVoice.current && status.fishReady) {
        recorder.cancel();
        setPlayingMessage(messageId.current);
        void speech.play(reply.speechText, agentLanguage, tutor, speechModel);
      }
    } catch (cause) {
      if (current !== sequence.current || controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "The lesson couldn’t continue. Try again.");
      if (text) setComposer(text);
    } finally {
      if (current === sequence.current) {
        request.current = null;
        setBusy(null);
        setPendingUser("");
      }
    }
  }

  async function translate(text = sourceText, from = translationSourceLanguage, to = translationLanguage) {
    if (request.current || !status?.tutorReady) return;
    const validation = speechTextError(text);
    if (validation) { setError(validation); return; }
    cancelCurrent();
    const current = ++sequence.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy("translation");
    setError("");
    setTranslation(null);
    try {
      const reply = await runFishAgentRequest("/api/translate", { language: to, sourceLanguage: from, text }, controller.signal, "translation");
      if (current === sequence.current) setTranslation(reply);
    } catch (cause) {
      if (current === sequence.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "The translation couldn’t finish. Try again.");
    } finally {
      if (current === sequence.current) { request.current = null; setBusy(null); }
    }
  }

  function changeTranslationLanguage(next: LanguageId, source: boolean) {
    cancelCurrent();
    setTranslation(null);
    setError("");
    if (source) setTranslationSourceLanguage(next);
    else setTranslationLanguage(next);
  }

  function toggleTranslationRecording() {
    if (recorder.state === "recording") { recorder.stop(); return; }
    if (request.current || recorder.state !== "idle" || !status?.fishReady || !status.tutorReady) return;
    speech.stop();
    setPlayingMessage(null);
    setError("");
    const current = sequence.current;
    const from = translationSourceLanguage;
    const to = translationLanguage;
    void recorder.start(from, (text) => {
      if (sequence.current !== current) return;
      setSourceText(text);
      void translate(text, from, to);
    });
  }

  function playText(text: string, id: number | null = null, speechLanguage: LanguageId = language, voice: TranslationVoice = "language") {
    recorder.cancel();
    if (speech.state !== "idle" && playingMessage === id) {
      speech.stop();
      setPlayingMessage(null);
      return;
    }
    setPlayingMessage(id);
    void speech.play(text, speechLanguage, tutor, speechModel, voice);
  }

  function toggleRecording() {
    if (recorder.state === "recording") { recorder.stop(); return; }
    if (working || optionsTranslating || pendingResponseLanguage || recorder.state !== "idle") return;
    speech.stop();
    setPlayingMessage(null);
    const current = sequence.current;
    void recorder.start(learnerLanguage, (text) => {
      if (sequence.current === current) void requestLesson(text);
    });
  }

  const connectionMessage = statusError || (
    status && !status.tutorReady ? "The tutor needs a connection before you can start. Check the local setup, then retry." :
    status && !status.fishReady ? "Text practice is ready. Connect Fish Audio in the local setup to hear your tutor and use the microphone." : ""
  );

  return (
    <div className={"app-page" + (activeLesson ? (continuousChat ? " active-lesson continuous-lesson" : " active-lesson") : isConversation ? " setup-lesson" : " translate-lesson")}>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Sona home"><span className="brand-symbol"><AudioLines size={22} /></span>sona<span className="brand-dot">.</span></Link>
        <nav className="main-tabs" aria-label="Learning mode">
          <button className={tab === "practice" ? "active" : ""} aria-pressed={tab === "practice"} onClick={() => changeTab("practice")}>Conversation (turns)</button>
          <button className={tab === "say" ? "active" : ""} aria-pressed={tab === "say"} onClick={() => changeTab("say")}>Translate</button>
          <button className={tab === "continuous" ? "active" : ""} aria-pressed={tab === "continuous"} onClick={() => changeTab("continuous")}>Continuous chat</button>
        </nav>
        <div className="header-actions">
          <SpeechModelSelect key={continuousChat ? "native" : "standard"} value={speechModel}
            allowedModels={continuousChat ? nativeSpeechModels : undefined} disabled={working || recording}
            onChange={(next) => { if (continuousChat) changeContext(); else { speech.stop(); setPlayingMessage(null); } setSpeechModel(next); }} />
        <button className={"preferences-button header-preferences " + (preferencesOpen ? "selected" : "")} aria-label="Preferences" title="Preferences" aria-expanded={preferencesOpen} aria-controls="preferences" onClick={() => setPreferencesOpen(!preferencesOpen)}><SlidersHorizontal size={15} /><span>Preferences</span></button>
        </div>
      </header>

      <div className="app-shell">
      <main className="main-content">
        {connectionMessage && <div className="connection-notice" role="status"><span>{connectionMessage}</span><button onClick={() => void refreshStatus()} disabled={checkingStatus}><RefreshCw size={14} />{checkingStatus ? "Checking…" : "Try again"}</button></div>}

        {preferencesOpen && <section id="preferences" className="preferences-panel" aria-label="Conversation preferences">
          {activeLesson && <label>Lesson language<select value={language} disabled={working || recording} onChange={(event) => { changeContext(); setLanguage(event.target.value as LanguageId); }}>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {isConversation && <><label>Level<select value={level} disabled={working || recording} onChange={(event) => { changeContext(); setLevel(event.target.value as Level); }}>{levels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Conversation topic<select value={topic} disabled={working || recording} onChange={(event) => { changeContext(); setTopic(event.target.value as TopicId); }}>{topics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
          <label>{isConversation ? "Your guide" : "Voice"}<select value={tutor} disabled={working || recording} onChange={(event) => { changeContext(); setTutor(event.target.value as TutorId); }}>{tutors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.description}</option>)}</select></label>
          {isConversation && conversationStarted && <p>Changing these starts a fresh conversation.</p>}
        </section>}

        <section className="learning-area" aria-label={isConversation ? "Guided conversation" : "Translate and listen"}>
          {isConversation ? (
            !conversationStarted ? (
              <div className="lesson-setup">
                <h1>{continuousChat ? "Start a continuous chat" : "Start a conversation"}</h1>
                <p className="setup-description">Choose your language. Your guide will help you find the words.</p>
                <div className="setup-layout">
                  <section className="setup-language" aria-labelledby="setup-language-heading">
                    <h2 id="setup-language-heading">Choose your language</h2>
                    <LanguageGrid value={language} disabled={working || recording} aria-labelledby="setup-language-heading"
                      onChange={(next) => { changeContext(); setLanguage(next); }} />
                    <LessonOptions topic={topic} level={level} disabled={working || recording}
                      onTopicChange={(next) => { changeContext(); setTopic(next); }}
                      onLevelChange={(next) => { changeContext(); setLevel(next); }} />
                  </section>
                  <aside className="setup-guide" aria-label="Your guide">
                    <TutorPicker value={tutor} disabled={working || recording}
                      onChange={(next) => { changeContext(); setTutor(next); }} />
                    <label className="voice-toggle setup-voice-toggle"><input type="checkbox" checked={continuousChat ? continuousVoice : spokenReplies} onChange={(event) => { const enabled = event.target.checked; if (continuousChat) setContinuousVoice(enabled); else { autoVoice.current = enabled; setSpokenReplies(enabled); } }} /><span className="toggle-track" /><span>Voice replies</span></label>
                    <button className="primary-button start-button" onClick={() => void (continuousChat ? startNativeConversation() : requestLesson())}
                      disabled={working || !status?.tutorReady || (continuousChat && !status?.fishReady)}>{checkingStatus ? "Getting ready…" : "Start conversation"}<ArrowRight size={18} /></button>
                  </aside>
                </div>
              </div>
            ) : continuousChat ? (
              <NativeVoiceChat tutor={tutor} language={language} topic={selectedTopic.name}
                messages={nativeMessages} state={nativeState} mode={nativeMode}
                muted={nativeMuted} onToggleMic={() => void toggleNativeMicrophone()}
                audioEnabled={continuousVoice} onAudioEnabledChange={(enabled) => void changeNativeAudio(enabled)}
                onEnd={changeContext} draft={composer} onDraftChange={setComposer} onSend={sendNativeText}
                suggestions={nativeSuggestions} guidanceLoading={nativeGuidanceLoading}
                disabled={!status?.fishReady || !status?.tutorReady} error={error || nativeGuidanceError} />
            ) : (
              <div className={"conversation-panel " + (recording ? "is-recording" : "")}>
                <div className="conversation-header">
                  <div className="tutor-settings"><div className="conversation-partner"><TutorPortrait tutor={tutor} small /><div><h2>{selectedTutor.name}<span>AI guide</span></h2><p>{selectedTopic.name} · {selectedLanguage.name}</p></div></div>
                    <div className="agent-voice-section"><VoiceLanguageSelect caption="Tutor voice" label="Tutor voice language" language={agentLanguage} tutor={tutor} disabled={working || recording || !status?.tutorReady} onChange={changeTutorVoiceLanguage} /></div>
                  </div>
                  <div className="conversation-actions"><label className="voice-toggle"><input type="checkbox" checked={spokenReplies} disabled={!status?.fishReady} onChange={(event) => { autoVoice.current = event.target.checked; setSpokenReplies(event.target.checked); if (!event.target.checked) speech.stop(); }} /><span className="toggle-track" /><span>Read aloud</span></label><button className="change-lesson-button" type="button" aria-label="Change language and lesson" onClick={changeContext}><ArrowLeft size={14} /><span>Change language</span></button></div>
                </div>
                <div className="lesson-workspace">
                <div className="conversation-column">
                  <h1 className="conversation-section-title">Conversation</h1>
                  <div ref={conversationLogRef} className="conversation-messages" role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text" tabIndex={0}>
                  {messages.map((message) => {
                    if (message.role === "user") return <UserMessage key={message.id} text={message.text} translation={message.translation} />;
                    const reply = message.reply!;
                    const active = playingMessage === message.id && speech.state !== "idle";
                    return <TutorMessage key={message.id} reply={reply} language={message.language} targetLanguage={agentLanguage} tutor={tutor} active={active}
                      audioState={speech.state} disabled={!status?.fishReady || !status?.tutorReady || recording || working}
                      onStop={speech.stop} onListen={(text, speechLanguage) => playText(text, message.id, speechLanguage)} />;
                  })}
                  {pendingUser && <UserMessage text={pendingUser} />}
                  {working && <div className="thinking"><TutorPortrait tutor={tutor} small /><span>{busy === "lesson" ? `${selectedTutor.name} is getting the conversation started` : `${selectedTutor.name} is thinking`}<span className="thinking-dots">…</span></span></div>}
                  </div>
                </div>
                <form className="composer" onSubmit={(event) => { event.preventDefault(); void requestLesson(composer); }}>
                  <div className="your-turn"><h2 role="status">{recorder.state === "starting" ? "Opening microphone…" : recorder.state === "recording" ? "Listening — read an answer below" : recorder.state === "transcribing" ? "Finding your words…" : working ? "One moment…" : "Your turn"}</h2>{(working || recording) && <button type="button" onClick={cancelCurrent}><X size={13} />Cancel</button>}</div>
                  <div ref={guidanceRef} className="reply-guidance" role="region" aria-label="Suggested replies" tabIndex={0}>
                  {lastReply?.feedback && !working && <p className="turn-tip"><span>Tip</span>{lastReply.feedback}</p>}
                  {lastReply && !working && <ReplyOptions options={lastReply.replyOptions} language={lastReplyLanguage} targetLanguage={learnerLanguage} tutor={tutor} onStop={speech.stop} onTranslationPendingChange={setOptionsTranslating} recorderState={recorder.state} chooseDisabled={!!pendingResponseLanguage} selectedIndex={selectedOption} playingIndex={playingMessage !== null && playingMessage < 0 ? -playingMessage - 1 : null} audioState={speech.state} audioDisabled={!status?.fishReady || !status?.tutorReady || recording || !!pendingResponseLanguage} onListen={(option, index, speechLanguage) => playText(option.text, -index - 1, speechLanguage)} onChoose={(option, index) => {
                    setSelectedOption(index);
                    setComposer(option.text);
                    if (!recording) composerRef.current?.focus();
                  }} />}
                  </div>
                  <div className="reply-controls">
                  <div className="chat-row reply-draft"><div className={"draft-bubble " + (!composer ? "is-empty" : "")}><label htmlFor="chat-reply" className="message-label">Your reply</label><div className="composer-input"><textarea ref={composerRef} id="chat-reply" aria-label="Your reply" lang={learnerLanguage} dir="auto" placeholder={recorder.state === "recording" ? "Listening… speak your reply." : "Your reply goes here…"} value={composer} onChange={(event) => { setComposer(event.target.value); setSelectedOption(null); }} disabled={working || recording || !!pendingResponseLanguage} rows={1} maxLength={MAX_TEXT_LENGTH} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void requestLesson(composer); } }} />
                    <button type="button" className={"mic-button " + (recorder.state === "recording" ? "recording stop-send-button" : "")} disabled={working || optionsTranslating || !!pendingResponseLanguage || !status?.fishReady || !status?.tutorReady || (recorder.state !== "idle" && recorder.state !== "recording")} aria-label={recorder.state === "recording" ? "Stop recording and send" : recorder.state === "starting" ? "Opening microphone" : "Record a reply"} onClick={toggleRecording}>{(recorder.state === "transcribing" || recorder.state === "starting") ? <LoaderCircle size={18} className="spin" /> : recorder.state === "recording" ? <Square size={15} fill="currentColor" /> : <Mic size={19} />}{recorder.state === "recording" && <span>Stop &amp; send</span>}</button>
                    {recorder.state !== "recording" && <button className="send-button" type="submit" disabled={working || recording || !!pendingResponseLanguage || !status?.tutorReady || !composer.trim()} aria-label="Send reply"><Send size={17} /></button>}
                  </div></div><UserAvatar /></div>
                  <div className="response-voice-section"><VoiceLanguageSelect caption="Your reply & suggestions" label="Your voice language" language={learnerLanguage} pendingLanguage={pendingResponseLanguage} tutor={tutor} disabled={working || recording || !status?.tutorReady} onChange={(next) => void changeResponseVoiceLanguage(next)} />
                    {(pendingResponseLanguage || optionsTranslating) && <p className="card-status" role="status">Updating your language…</p>}
                    {responseLanguageError && <p className="field-error" role="alert">{responseLanguageError}</p>}
                  </div>
                  {recorder.state === "recording" && <p className="composer-note">Your options stay here while you speak. Tap stop to send.</p>}
                  </div>
                </form>
                </div>
              </div>
            )
          ) : (
            <TranslateWorkspace sourceLanguage={translationSourceLanguage} targetLanguage={translationLanguage}
              voice={translationVoice} cloneReady={!!status?.translationCloneReady}
              onVoiceChange={(voice) => { speech.stop(); setPlayingMessage(null); setTranslationVoice(voice); }}
              tutor={tutor} sourceText={sourceText} translation={translation}
              onSourceTextChange={(text) => { speech.stop(); setSourceText(text); setTranslation(null); setError(""); }}
              onExampleSelect={(text) => { if (request.current || recording) return; setSourceText(text); void translate(text); }}
              onSourceLanguageChange={(next) => changeTranslationLanguage(next, true)}
              onTargetLanguageChange={(next) => changeTranslationLanguage(next, false)}
              onTranslate={() => void translate()} onToggleRecording={toggleTranslationRecording}
              onCancel={cancelCurrent} busy={working} recorderState={recorder.state}
              disabled={!status?.tutorReady} speechReady={!!status?.fishReady}
              active={playingMessage === null && speech.state !== "idle"} audioState={speech.state}
              onStop={speech.stop} onListen={(text, target) => playText(text, null, target, translationVoice)} />
          )}
          {(!continuousChat || !nativeStarted) && (error || (!continuousChat && (speech.error || recorder.error))) && <div className="inline-error" role="alert"><span>{error || recorder.error || speech.error}</span>{error && <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={15} /></button>}</div>}
        </section>
      </main>
      </div>
    </div>
  );
}
