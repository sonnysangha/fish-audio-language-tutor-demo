import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TutorMessage } from "../components/tutor-message";
import type { LanguageId, TutorReply } from "../lib/types";

const reply: TutorReply = {
  text: "Hola, ¿un café?", speechText: "Hola, [curious]¿un café?",
  translation: "Hello, a coffee?", userTranslation: "", pronunciation: "OH-lah, oon kah-FEH?",
  feedback: "", emotion: "curious",
  replyOptions: [
    { text: "Sí.", meaning: "Yes.", pronunciation: "See." },
    { text: "No.", meaning: "No.", pronunciation: "Noh." },
    { text: "Un té.", meaning: "A tea.", pronunciation: "Oon teh." },
  ],
};

function render(targetLanguage: LanguageId) {
  return renderToStaticMarkup(createElement(TutorMessage, {
    reply, language: "es", targetLanguage, tutor: "maya", active: false,
    audioState: "idle", disabled: false, onListen() {}, onStop() {},
  }));
}

test("tutor bubble uses the central language selection while retaining editable emotion text", () => {
  const markup = render("es");
  assert.doesNotMatch(markup, /<select|Voice language for tutor reply/);
  assert.match(markup, /Edit words and emotion/);
  assert.match(markup, /<span class="emotion-token" data-emotion="curious">\[curious\]<\/span>/);
  const audioButton = markup.match(/<button[^>]*class="audio-button"[^>]*>/)?.[0];
  assert.ok(audioButton);
  assert.doesNotMatch(audioButton, /disabled/);
  assert.doesNotMatch(markup, /Translating this reply/);
});

test("tutor bubble cannot play old-language text before its target translation starts", () => {
  const markup = render("fr");
  assert.match(markup, /<button[^>]*class="audio-button"[^>]*disabled/);
  assert.match(markup, /Translating this reply/);
  assert.match(markup, /lang="es"/);
});
