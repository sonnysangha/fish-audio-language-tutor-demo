import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeechResponse } from "../components/speech-response";
import type { LanguageId } from "../lib/types";

function render(value: string, language: LanguageId = "es") {
  return renderToStaticMarkup(createElement(SpeechResponse, { value, original: value, language, onChange() {} }));
}

function paragraph(markup: string) {
  const match = markup.match(/<p class="spoken-response"[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(match, "The response should be the main paragraph");
  return match[1];
}

test("speech response highlights inline cues without changing words, brackets or spacing", () => {
  const markup = render("Hola, [curious]¿un café?  [excited]¡Sí!\nAdelante.");
  assert.equal(paragraph(markup), 'Hola, <span class="emotion-token" data-emotion="curious">[curious]</span>¿un café?  <span class="emotion-token" data-emotion="excited">[excited]</span>¡Sí!\nAdelante.');
  assert.match(markup, /lang="es" dir="auto"/);
  assert.equal(paragraph(render("こんにちは[warm and encouraging]お元気ですか？", "ja")), 'こんにちは<span class="emotion-token" data-emotion="warm and encouraging">[warm and encouraging]</span>お元気ですか？');
});

test("speech response escapes markup in both words and emotion cues", () => {
  const markup = render('Antes <img src=x onerror=alert(1)> [<b>excited</b>] & después.');
  assert.equal(paragraph(markup), 'Antes &lt;img src=x onerror=alert(1)&gt; <span class="emotion-token" data-emotion="&lt;b&gt;excited&lt;/b&gt;">[&lt;b&gt;excited&lt;/b&gt;]</span> &amp; después.');
  assert.doesNotMatch(markup, /<img|<b>/);
});

test("default speech response shows only the response and its pencil edit control", () => {
  const markup = render("Hola [calm]amigo.");
  assert.equal((markup.match(/<button\b/g) ?? []).length, 1);
  assert.match(markup, /class="speech-edit-toggle" aria-label="Edit words and emotion" title="Edit words and emotion"/);
  assert.doesNotMatch(markup, /<textarea|<details|<summary|cue-buttons|editor-help|Words &amp; emotion|>Reset<|>Done</);
});
