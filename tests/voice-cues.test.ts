import assert from "node:assert/strict";
import test from "node:test";
import { insertVoiceCue, voiceCues } from "../lib/voice-cues";

test("all seven brief pairings and free-form directions are preserved exactly", () => {
  assert.deepEqual(voiceCues.filter((cue) => cue.category === "pairings" || cue.category === "directions").map((cue) => cue.tag), [
    "[panting] [tired]",
    "[laughing] [excited]",
    "[clears throat] [angry]",
    "[sighing] [emphasis]",
    "[the calm, measured tone of someone who has done this a thousand times]",
    "[dead tired, end of a very long shift]",
    "[voice rough from crying, trying to sound normal]",
  ]);
});

test("inserting a pairing between words preserves both words and adds required spaces", () => {
  const result = insertVoiceCue("Hello friend.", "[panting] [tired]", 6, 6, 1000)!;
  assert.equal(result.text, "Hello [panting] [tired] friend.");
  assert.equal(result.text.slice(result.cursor), "friend.");
});

test("existing spaces are retained and the cursor lands after the cue separator", () => {
  const result = insertVoiceCue("Hello friend.", "[sighing] [emphasis]", 5, 5, 1000)!;
  assert.equal(result.text, "Hello [sighing] [emphasis] friend.");
  assert.equal(result.text.slice(result.cursor), "friend.");
});

test("a selected range is replaced while surrounding multilingual text stays exact", () => {
  const value = "こんにちは、OLD world!";
  const start = value.indexOf("OLD");
  const result = insertVoiceCue(value, "[dead tired, end of a very long shift]", start, start + 3, 1000)!;
  assert.equal(result.text, "こんにちは、 [dead tired, end of a very long shift] world!");
  assert.equal(result.text.slice(result.cursor), "world!");
});

test("empty editor insertion adds a trailing space and oversized insertions are rejected", () => {
  const result = insertVoiceCue("", "[excited]", 0, 0, 1000)!;
  assert.equal(result.text, "[excited] ");
  assert.equal(result.cursor, result.text.length);
  assert.equal(insertVoiceCue("a".repeat(999), "[excited]", 999, 999, 1000), null);
});
