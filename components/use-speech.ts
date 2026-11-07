"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PcmDecoder } from "@/lib/pcm";
import { resumeAudioContext } from "@/lib/audio-context";
import type { LanguageId, TutorId } from "@/lib/types";
import { DEFAULT_SPEECH_MODEL, type SpeechModelId } from "@/lib/speech-models";
import type { TranslationVoice } from "@/lib/translation-voice";

export function useSpeech() {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState("");
  const [completedPlayback, setCompletedPlayback] = useState(0);
  const active = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const context = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useCallback(() => {
    active.current++;
    controller.current?.abort();
    controller.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
  }, []);
  const stop = useCallback(() => {
    release();
    setState("idle");
    setError("");
  }, [release]);
  useEffect(() => release, [release]);
  const play = useCallback(async (text: string, language: LanguageId, tutor: TutorId, model: SpeechModelId = DEFAULT_SPEECH_MODEL, voice: TranslationVoice = "language") => {
    release();
    const generation = active.current;
    setError("");
    setState("loading");
    const request = new AbortController();
    controller.current = request;
    let openedAudio: AudioContext | null = null;
    try {
      if (typeof AudioContext === "undefined")
        throw new Error("Audio playback is unavailable in this browser.");
      const audio = new AudioContext({ sampleRate: 24000 });
      openedAudio = audio;
      context.current = audio;
      await resumeAudioContext(audio, request.signal);
      if (generation !== active.current) return;
      const response = await fetch("/api/speech", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language, tutor, model, voice }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]),
      });
      if (!response.ok || !response.body) {
        if (response.status === 402) throw new Error("This paid voice model needs Fish Audio API credits. Add credits or choose S2.1 Pro Free.");
        throw new Error("Speech is unavailable. Please try again.");
      }
      const reader = response.body.getReader();
      const decoder = new PcmDecoder();
      let nextTime = audio.currentTime + 0.05;
      let received = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (generation !== active.current) { await reader.cancel(); return; }
        const samples = decoder.decode(value);
        if (!samples.length) continue;
        const buffer = audio.createBuffer(1, samples.length, 24000);
        buffer.getChannelData(0).set(samples);
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(audio.destination);
        nextTime = Math.max(nextTime, audio.currentTime + 0.02);
        source.start(nextTime);
        nextTime += buffer.duration;
        if (!received) { received = true; setState("playing"); }
      }
      if (!received) throw new Error("No audio arrived. Please try again.");
      timer.current = setTimeout(() => {
        if (generation !== active.current) return;
        setState("idle");
        setCompletedPlayback((count) => count + 1);
        void audio.close().catch(() => {});
        context.current = null;
        timer.current = null;
      }, Math.max(0, (nextTime - audio.currentTime) * 1000) + 80);
    } catch (cause) {
      if (generation !== active.current) return;
      setState("idle");
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Speech is unavailable. Please try again.");
      void openedAudio?.close().catch(() => {});
      context.current = null;
    }
  }, [release]);
  return { state, error, play, stop, completedPlayback };
}
