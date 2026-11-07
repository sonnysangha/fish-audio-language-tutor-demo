import assert from "node:assert/strict";
import { test } from "node:test";
import { resumeAudioContext } from "../lib/audio-context";

test("audio startup times out when browser autoplay leaves resume pending", async () => {
  const audio = { state: "suspended" as const, resume: () => new Promise<void>(() => {}) };
  await assert.rejects(resumeAudioContext(audio, new AbortController().signal, 10), /Press Play/);
});

test("stopping audio cancels a pending resume immediately", async () => {
  const request = new AbortController();
  const audio = { state: "suspended" as const, resume: () => new Promise<void>(() => {}) };
  const starting = resumeAudioContext(audio, request.signal, 60000);
  request.abort();
  await assert.rejects(starting, { name: "AbortError" });
});

test("audio startup requires a running context and handles browser rejection", async () => {
  const signal = new AbortController().signal;
  await resumeAudioContext({ state: "running", resume: async () => {} }, signal);
  await assert.rejects(resumeAudioContext({ state: "suspended", resume: async () => {} }, signal), /paused by your browser/);
  await assert.rejects(resumeAudioContext({ state: "suspended", resume: () => { throw new Error("Device unavailable"); } }, signal), /Device unavailable/);
});
