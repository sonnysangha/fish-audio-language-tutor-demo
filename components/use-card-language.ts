"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { runFishAgentRequest } from "@/lib/fish-agent-client";
import { queueTranslation } from "@/lib/translation-queue";
import { speechTextError, type LanguageId } from "@/lib/types";

export type VoiceCardContent = {
  text: string;
  speechText: string;
  meaning: string;
  pronunciation: string;
};

type CardState = {
  sourceKey: string;
  content: VoiceCardContent;
  language: LanguageId;
  pendingLanguage: LanguageId | null;
  error: string;
};

export function useCardLanguage(original: VoiceCardContent, originalLanguage: LanguageId, onStop: () => void) {
  // Parents may construct the content object inline. Only actual source changes
  // reset a card; an unrelated parent render must not cancel its translation.
  const sourceKey = JSON.stringify([originalLanguage, original.text, original.speechText, original.meaning, original.pronunciation]);
  const initial: CardState = { sourceKey, content: original, language: originalLanguage, pendingLanguage: null, error: "" };
  const [state, setState] = useState<CardState>(initial);
  if (state.sourceKey !== sourceKey) setState(initial);

  const latest = useRef({ state, original, originalLanguage, onStop });
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    latest.current = { state, original, originalLanguage, onStop };
  });

  const cancelPending = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
  }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelPending();
    };
  }, [sourceKey, cancelPending]);

  const changeLanguage = useCallback(async (target: LanguageId, sourceSpeechText?: string) => {
    if (!mounted.current) return;
    const snapshot = latest.current;
    cancelPending();
    const requestNumber = sequence.current;

    const update = (next: CardState) => {
      latest.current.state = next;
      setState(next);
    };
    const previous = snapshot.state;
    if (target === previous.language) {
      update({ ...previous, pendingLanguage: null, error: "" });
      return;
    }
    snapshot.onStop();
    if (target === snapshot.originalLanguage) {
      update({ ...previous, content: snapshot.original, language: target, pendingLanguage: null, error: "" });
      return;
    }

    const text = sourceSpeechText ?? previous.content.speechText;
    const validationError = speechTextError(text);
    if (validationError) {
      update({ ...previous, pendingLanguage: null, error: validationError });
      return;
    }
    const request = new AbortController();
    controller.current = request;
    update({ ...previous, pendingLanguage: target, error: "" });
    try {
      const reply = await queueTranslation((signal) => runFishAgentRequest("/api/translate", {
        text, sourceLanguage: previous.language, language: target,
      }, signal, "translation"), request.signal);
      if (!mounted.current || request.signal.aborted || requestNumber !== sequence.current) return;
      update({
        sourceKey: previous.sourceKey,
        content: { text: reply.text, speechText: reply.speechText, meaning: reply.meaning, pronunciation: reply.pronunciation },
        language: target,
        pendingLanguage: null,
        error: "",
      });
    } catch {
      if (!mounted.current || request.signal.aborted || requestNumber !== sequence.current) return;
      update({ ...previous, pendingLanguage: null, error: "Couldn't translate this response. Please try again." });
    } finally {
      if (requestNumber === sequence.current) controller.current = null;
    }
  }, [cancelPending]);

  return {
    content: state.content,
    language: state.language,
    pendingLanguage: state.pendingLanguage,
    translating: state.pendingLanguage !== null,
    error: state.error,
    changeLanguage,
  };
}
