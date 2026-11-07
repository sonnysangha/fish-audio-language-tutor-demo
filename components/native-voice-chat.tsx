"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Keyboard, LoaderCircle, Mic, MicOff, PhoneOff, Send } from "lucide-react";
import { TutorPortrait } from "@/components/chat-avatar";
import { languages, MAX_TEXT_LENGTH, speechTextError, type LanguageId, type ReplyOption, type TutorId } from "@/lib/types";

export type NativeVoiceChatProps = {
  tutor: TutorId;
  language: LanguageId;
  topic: string;
  messages: Array<{ id: string | number; role: "user" | "assistant"; text: string; final: boolean; translation?: string }>;
  state: "idle" | "connecting" | "connected" | "reconnecting" | "ended";
  mode: "listening" | "thinking" | "speaking";
  muted: boolean;
  onToggleMic: () => void;
  audioEnabled: boolean;
  onAudioEnabledChange: (enabled: boolean) => void;
  onEnd: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
  suggestions: ReplyOption[];
  guidanceLoading: boolean;
  disabled: boolean;
  error?: string;
};

export function NativeVoiceChat({ tutor, language, topic, messages, state, mode, muted, onToggleMic,
  audioEnabled, onAudioEnabledChange, onEnd, draft, onDraftChange, onSend, suggestions,
  guidanceLoading, disabled, error }: NativeVoiceChatProps) {
  const [typing, setTyping] = useState(false);
  const [followingLatest, setFollowingLatest] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const typingId = useId();
  const name = tutor === "maya" ? "Maya" : "Leo";
  const selectedLanguage = languages.find((item) => item.id === language)!;
  const inputDisabled = disabled || state !== "connected";
  // An open microphone must remain pausable if connection or request state changes.
  const microphoneDisabled = state === "connecting" || (muted ? inputDisabled : state === "idle" || state === "ended");
  const validDraft = !speechTextError(draft);
  const visualState = state === "connected" ? mode === "listening" && muted ? "paused" : mode : state;
  const status = state === "connecting" ? "Connecting…"
    : state === "reconnecting" ? "Reconnecting…"
    : state === "ended" ? "Conversation ended"
    : state === "idle" ? "Ready to begin"
    : mode === "speaking" ? `${name} is speaking`
    : mode === "thinking" ? `${name} is thinking…`
    : muted ? "Microphone paused" : "Listening to you";

  useEffect(() => {
    if (typing && !inputDisabled) input.current?.focus();
  }, [typing, inputDisabled]);

  useLayoutEffect(() => {
    const conversation = feed.current;
    if (conversation && followLatest.current) conversation.scrollTop = conversation.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const conversation = feed.current;
    if (!conversation) return;
    const scrollLatest = () => {
      if (followLatest.current) conversation.scrollTop = conversation.scrollHeight;
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scrollLatest);
    observer?.observe(conversation);
    window.addEventListener("resize", scrollLatest);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scrollLatest);
    };
  }, []);

  function sendDraft() {
    if (inputDisabled || !validDraft) return;
    onSend(draft);
  }

  return <section className={"continuous-chat native-voice-chat vc-state-" + visualState} aria-label="Voice conversation">
    <div className="vc-topbar">
      <div><h1>Voice chat</h1><p>{selectedLanguage.name}<span aria-hidden="true"> · </span>{topic}</p></div>
      <button type="button" className="vc-end" onClick={onEnd}><PhoneOff size={14} aria-hidden="true" />End chat</button>
    </div>

    {error && <p className="nvc-error" role="alert">{error}</p>}

    <div className="vc-main">
      <div className="vc-guide">
        <div className="vc-avatar"><TutorPortrait tutor={tutor} /></div>
        <div><h2>{name}</h2><p className="vc-state" role="status"><span className="vc-state-dot" aria-hidden="true" />{status}</p></div>
      </div>

      <div ref={feed} className="vc-feed" role="log" aria-label="Conversation history" aria-live="polite"
        aria-relevant="additions text" tabIndex={0}
        onScroll={() => {
          const conversation = feed.current;
          if (conversation) {
            const following = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 48;
            followLatest.current = following;
            setFollowingLatest(following);
          }
        }}>
        {messages.filter((message) => message.text.trim()).map((message) => <article key={message.id}
          className={"vc-message vc-message-" + message.role + (message.final ? "" : " nvc-message-interim")}
          aria-busy={!message.final}>
          <span className="vc-speaker">{message.role === "assistant" ? name : "You"}
            {!message.final && <span className="nvc-interim-label">Live</span>}
          </span>
          <div className="vc-message-bubble">
            <p dir="auto" lang={message.role === "assistant" ? language : undefined}>{message.text}</p>
            {message.translation && message.translation.trim() !== message.text.trim() && <p className="vc-message-translation" lang="en" dir="ltr">{message.translation}</p>}
          </div>
        </article>)}
        {messages.length === 0 && state === "idle" && <p className="vc-empty">Your conversation will appear here.</p>}
      </div>

      {!followingLatest && <button type="button" className="vc-replay nvc-jump" onClick={() => {
        followLatest.current = true;
        setFollowingLatest(true);
        if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
      }}>Jump to latest<ArrowDown size={14} aria-hidden="true" /></button>}

      {(suggestions.length > 0 || guidanceLoading) && <section className="vc-suggestions" aria-label="Suggested replies">
        <div className="vc-suggestions-heading"><h2>Try saying</h2>
          {guidanceLoading ? <span className="nvc-guidance-status" role="status"><LoaderCircle size={12} className="spin" aria-hidden="true" />Updating suggestions</span>
            : <span>Choose one, or use your own words.</span>}
        </div>
        <div className="vc-suggestion-list">
          {suggestions.slice(0, 3).map((option, index) => <button key={index} type="button"
            className={"vc-suggestion" + (draft === option.text ? " selected" : "")}
            aria-pressed={draft === option.text} disabled={inputDisabled || guidanceLoading}
            onClick={() => { onDraftChange(option.text); setTyping(true); }}>
            <span lang={language} dir="auto">{option.text}</span>
            {option.meaning.trim() !== option.text.trim() && <small lang="en" dir="ltr">{option.meaning}</small>}
          </button>)}
        </div>
      </section>}
    </div>

    <div className="vc-controls">
      <button type="button" className={"vc-talk-button nvc-mic-button" + (muted ? " nvc-mic-paused" : "")}
        disabled={microphoneDisabled} onClick={onToggleMic} aria-pressed={!muted}>
        {muted ? <Mic size={21} aria-hidden="true" /> : <MicOff size={21} aria-hidden="true" />}
        {muted ? "Resume microphone" : "Pause microphone"}
      </button>
      <p className="vc-talk-hint">{muted ? "Microphone paused • resume when you’re ready" : "Microphone stays on • pause any time"}</p>
      <div className="vc-control-options">
        <button type="button" className="vc-type-toggle" aria-expanded={typing} aria-controls={typingId}
          onClick={() => setTyping((current) => !current)}><Keyboard size={15} aria-hidden="true" />{typing ? "Hide text reply" : "Type a reply"}</button>
        <label className="voice-toggle"><input type="checkbox" checked={audioEnabled}
          onChange={(event) => onAudioEnabledChange(event.target.checked)} />
          <span className="toggle-track" aria-hidden="true" /><span>Spoken replies</span></label>
      </div>
      {typing && <form id={typingId} className="vc-typed-reply" onSubmit={(event) => { event.preventDefault(); sendDraft(); }}>
        <label htmlFor={typingId + "-input"} className="sr-only">Your reply</label>
        <textarea ref={input} id={typingId + "-input"} rows={1} lang={language} dir="auto"
          value={draft} disabled={inputDisabled} maxLength={MAX_TEXT_LENGTH} placeholder="Type your reply…"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendDraft(); }
          }} />
        <button type="submit" aria-label="Send text reply" disabled={inputDisabled || !validDraft}><Send size={17} aria-hidden="true" /></button>
      </form>}
    </div>
  </section>;
}
