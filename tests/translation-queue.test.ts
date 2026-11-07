import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createTranslationQueue } from "../lib/translation-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("card translation queue starts at most two jobs and preserves waiting order", async () => {
  const queue = createTranslationQueue();
  const work = Array.from({ length: 4 }, () => deferred<number>());
  const started: number[] = [];
  const results = work.map((item, index) => queue(async () => {
    started.push(index);
    return item.promise;
  }, new AbortController().signal));
  await setImmediate();
  assert.deepEqual(started, [0, 1]);
  work[1].resolve(1);
  assert.equal(await results[1], 1);
  await setImmediate();
  assert.deepEqual(started, [0, 1, 2]);
  work[0].resolve(0);
  await results[0];
  await setImmediate();
  assert.deepEqual(started, [0, 1, 2, 3]);
  work[2].resolve(2);
  work[3].resolve(3);
  assert.deepEqual(await Promise.all(results), [0, 1, 2, 3]);
});

test("cancelled waiting translations never start a Fish request", async () => {
  const queue = createTranslationQueue(1);
  const first = deferred<string>();
  const running = queue(() => first.promise, new AbortController().signal);
  const abort = new AbortController();
  let cancelledStarted = false;
  const cancelled = queue(async () => { cancelledStarted = true; return "unwanted"; }, abort.signal);
  const rejected = assert.rejects(cancelled, { name: "AbortError" });
  abort.abort();
  await rejected;
  const next = queue(async () => "next", new AbortController().signal);
  first.resolve("first");
  assert.equal(await running, "first");
  assert.equal(await next, "next");
  assert.equal(cancelledStarted, false);
});

test("an aborted running request keeps its slot until provider cleanup settles", async () => {
  const queue = createTranslationQueue(1);
  const first = deferred<string>();
  const abort = new AbortController();
  const running = queue((signal) => { assert.equal(signal, abort.signal); return first.promise; }, abort.signal);
  await setImmediate();
  const rejected = assert.rejects(running, { name: "AbortError" });
  abort.abort();
  await rejected;
  let nextStarted = false;
  const next = queue(async () => { nextStarted = true; return "next"; }, new AbortController().signal);
  await setImmediate();
  assert.equal(nextStarted, false);
  first.resolve("stale result");
  assert.equal(await next, "next");
});

test("a failed translation frees its slot without retrying the provider", async () => {
  const queue = createTranslationQueue(1);
  let attempts = 0;
  const failed = queue(async () => { attempts++; throw new Error("fictional failure"); }, new AbortController().signal);
  const rejected = assert.rejects(failed, /fictional failure/);
  const next = queue(async () => "recovered", new AbortController().signal);
  await rejected;
  assert.equal(await next, "recovered");
  assert.equal(attempts, 1);
});

test("a signal cancelled before enqueue or before its start microtask sends nothing", async () => {
  const queue = createTranslationQueue();
  let starts = 0;
  const before = new AbortController();
  before.abort();
  await assert.rejects(queue(async () => { starts++; }, before.signal), { name: "AbortError" });
  const immediate = new AbortController();
  const pending = queue(async () => { starts++; }, immediate.signal);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  immediate.abort();
  await rejected;
  await setImmediate();
  assert.equal(starts, 0);
});
