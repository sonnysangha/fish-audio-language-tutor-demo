import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReplyOptions } from "../components/reply-options";
import type { RecorderState } from "../components/use-recorder";

const options = [
  { text: "Un café, por favor.", meaning: "A coffee, please.", pronunciation: "oon kah-FEH, por fah-VOR" },
  { text: "Prefiero un té.", meaning: "I prefer tea.", pronunciation: "preh-FYEH-roh oon teh" },
  { text: "Solo agua, gracias.", meaning: "Just water, thank you.", pronunciation: "SOH-loh AH-gwah, GRAH-syahs" },
];

test("all three speaking options remain readable and selectable through microphone startup and recording", () => {
  for (const recorderState of ["idle", "starting", "recording"] satisfies RecorderState[]) {
    const html = renderToStaticMarkup(createElement(ReplyOptions, {
      options, language: "es", targetLanguage: "es", tutor: "maya", recorderState, selectedIndex: 1, onChoose: () => {},
      onListen: () => {}, onStop: () => {}, onTranslationPendingChange: () => {}, playingIndex: null, audioState: "idle", audioDisabled: recorderState !== "idle",
    }));
    for (const option of options) {
      assert.ok(html.includes(option.text));
      assert.ok(html.includes(option.meaning));
      assert.ok(html.includes(option.pronunciation));
    }
    assert.equal((html.match(/<button/g) ?? []).length, 6);
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
    const choices = html.match(/<button[^>]*aria-label="Choose reply[^>]*>/g) ?? [];
    assert.equal(choices.length, 3);
    for (const choice of choices) assert.ok(!choice.includes("disabled="));
    const audio = html.match(/<button[^>]*aria-label="Listen to reply option[^>]*>/g) ?? [];
    assert.equal(audio.length, 3);
    for (const button of audio) assert.equal(button.includes("disabled="), recorderState !== "idle");
    assert.ok(!html.includes("<select"));
    assert.ok(!html.includes("type=\"submit\""));
    if (recorderState === "recording") assert.ok(html.includes("Read one aloud"));
  }
});

test("transcribing keeps the spoken choices on screen without accepting another choice", () => {
  const html = renderToStaticMarkup(createElement(ReplyOptions, {
    options, language: "es", targetLanguage: "es", tutor: "maya", recorderState: "transcribing", selectedIndex: null, onChoose: () => {},
    onListen: () => {}, onStop: () => {}, onTranslationPendingChange: () => {}, playingIndex: null, audioState: "idle", audioDisabled: true,
  }));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 6);
  for (const option of options) assert.ok(html.includes(option.text));
});

test("a changed target language disables stale replies before translation starts", () => {
  let stopped = false;
  let reported = false;
  const html = renderToStaticMarkup(createElement(ReplyOptions, {
    options, language: "es", targetLanguage: "ja", tutor: "maya", recorderState: "idle", selectedIndex: null,
    onChoose: () => {}, onListen: () => {}, onStop: () => { stopped = true; },
    onTranslationPendingChange: () => { reported = true; }, playingIndex: null, audioState: "idle", audioDisabled: false,
  }));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 6);
  assert.equal((html.match(/Translating this reply/g) ?? []).length, 3);
  for (const option of options) assert.ok(html.includes(option.text));
  assert.equal(stopped, false);
  assert.equal(reported, false);
});

test("draft translation prevents choosing another reply while keeping matching text visible", () => {
  const html = renderToStaticMarkup(createElement(ReplyOptions, {
    options, language: "es", targetLanguage: "es", tutor: "maya", recorderState: "idle", selectedIndex: null,
    chooseDisabled: true, onChoose: () => {}, onListen: () => {}, onStop: () => {},
    onTranslationPendingChange: () => {}, playingIndex: null, audioState: "idle", audioDisabled: false,
  }));
  const choices = html.match(/<button[^>]*aria-label="Choose reply[^>]*>/g) ?? [];
  assert.equal(choices.length, 3);
  for (const choice of choices) assert.ok(choice.includes("disabled="));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
  for (const option of options) assert.ok(html.includes(option.text));
});
