"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LanguageId } from "@/lib/types";

export type RecorderState = "idle" | "starting" | "recording" | "transcribing";

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const release = useCallback(() => {
    sequence.current++;
    request.current?.abort();
    request.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);
  useEffect(() => release, [release]);
  const cancel = useCallback(() => { release(); setState("idle"); setError(""); }, [release]);
  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);
  const start = useCallback(async (language: LanguageId, onText: (text: string) => void) => {
    release();
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording is unavailable in this browser. You can type your reply.");
      setState("idle");
      return;
    }
    const generation = sequence.current;
    setState("starting");
    try {
      const tracks = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== sequence.current) { tracks.getTracks().forEach((track) => track.stop()); return; }
      stream.current = tracks;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(tracks, mimeType ? { mimeType } : undefined);
      recorder.current = recording;
      const chunks: Blob[] = [];
      let size = 0;
      recording.ondataavailable = (event) => {
        size += event.data.size;
        chunks.push(event.data);
        if (size > 5 * 1024 * 1024 && recording.state === "recording") recording.stop();
      };
      recording.onstop = async () => {
        tracks.getTracks().forEach((track) => track.stop());
        if (generation !== sequence.current) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        recorder.current = null;
        stream.current = null;
        if (!size || size > 5 * 1024 * 1024) { setError("Try a shorter voice message."); setState("idle"); return; }
        setState("transcribing");
        const controller = new AbortController();
        request.current = controller;
        try {
          const data = new FormData();
          const type = recording.mimeType || "audio/webm";
          const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          data.append("audio", new Blob(chunks, { type }), `lesson.${extension}`);
          data.append("language", language);
          const response = await fetch("/api/transcribe", { method: "POST", body: data, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
          if (!response.ok) throw new Error("Could not transcribe that message. Try again or type your reply.");
          const result = await response.json();
          if (generation !== sequence.current) return;
          if (typeof result.text !== "string" || !result.text.trim()) throw new Error("No speech was detected. Try again or type your reply.");
          onText(result.text);
        } catch (cause) {
          if (generation === sequence.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not transcribe that message.");
        } finally {
          if (generation === sequence.current) setState("idle");
        }
      };
      recording.onerror = () => { if (generation === sequence.current) { release(); setState("idle"); setError("Recording stopped. Please try again."); } };
      recording.start(1000);
      setState("recording");
      timer.current = setTimeout(() => { if (recording.state === "recording") recording.stop(); }, 60000);
    } catch {
      if (generation === sequence.current) { release(); setState("idle"); setError("Allow microphone access to speak, or type your reply below."); }
    }
  }, [release]);
  return { state, error, start, stop, cancel };
}
