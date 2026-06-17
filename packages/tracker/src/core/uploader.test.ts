import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Uploader, type UploaderOptions } from './uploader';
import type { AnyEvent } from '../types';

/** Event whose JSON.stringify length is ~ n + 34. */
function sized(n: number): AnyEvent {
  return { type: 3, data: 'x'.repeat(n), timestamp: 1 } as unknown as AnyEvent;
}

interface Sent {
  seq: number;
  events: AnyEvent[];
}

let sent: Sent[] = [];
let nextStatus: () => number = () => 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent = [];
  nextStatus = () => 200;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Sent;
    sent.push({ seq: body.seq, events: body.events });
    const status = nextStatus();
    return { ok: status >= 200 && status < 300, status } as Response;
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function makeUploader(over: Partial<UploaderOptions> = {}): Uploader {
  let invalid = 0;
  const up = new Uploader({
    host: 'https://h',
    key: 'k',
    intervalMs: 1_000_000, // never auto-fire in tests
    thresholdBytes: 10_000_000, // never auto-flush from enqueue
    getSessionId: () => 'rrk_s_test',
    onInvalidSession: () => {
      invalid++;
    },
    ...over,
  });
  (up as unknown as { invalidCount: () => number }).invalidCount = () => invalid;
  return up;
}

function buffer(up: Uploader): AnyEvent[] {
  return (up as unknown as { buffer: AnyEvent[] }).buffer;
}
function seq(up: Uploader): number {
  return (up as unknown as { seq: number }).seq;
}

test('a batch is capped at maxBatchBytes (oversized events sent one at a time)', async () => {
  const up = makeUploader({ maxBatchBytes: 100 });
  up.enqueue(sized(100)); // ~134 bytes each, each alone exceeds the cap
  up.enqueue(sized(100));
  up.enqueue(sized(100));

  await up.flush();
  await up.flush();
  await up.flush();

  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((s) => s.events.length), [1, 1, 1]);
  assert.deepEqual(sent.map((s) => s.seq), [0, 1, 2]);
  assert.equal(buffer(up).length, 0);
});

test('without a tight cap, a flush sends the whole buffer in one request', async () => {
  const up = makeUploader(); // default cap = MAX_BATCH_BYTES (8MB)
  up.enqueue(sized(10));
  up.enqueue(sized(10));
  up.enqueue(sized(10));
  await up.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].events.length, 3);
});

test('a permanently-rejected batch (413) is dropped, not requeued forever', async () => {
  const up = makeUploader();
  nextStatus = () => 413;
  up.enqueue(sized(10));
  await up.flush();
  assert.equal(sent.length, 1);
  assert.equal(buffer(up).length, 0); // dropped
  assert.equal(seq(up), 0); // not advanced

  // Nothing left to send.
  await up.flush();
  assert.equal(sent.length, 1);
});

test('a 400 batch is also dropped (poison-pill protection)', async () => {
  const up = makeUploader();
  nextStatus = () => 400;
  up.enqueue(sized(10));
  await up.flush();
  assert.equal(buffer(up).length, 0);
});

test('a transient 5xx requeues the batch and retries with the same seq', async () => {
  const up = makeUploader();
  let calls = 0;
  nextStatus = () => (++calls === 1 ? 503 : 200);
  up.enqueue(sized(10));

  await up.flush(); // 503 → requeue
  assert.equal(buffer(up).length, 1);
  assert.equal(seq(up), 0);

  await up.flush(); // 200 → success
  assert.equal(buffer(up).length, 0);
  assert.equal(seq(up), 1);
  assert.deepEqual(sent.map((s) => s.seq), [0, 0]); // same seq retried
});

test('a 404/409 triggers onInvalidSession', async () => {
  const up = makeUploader();
  nextStatus = () => 404;
  up.enqueue(sized(10));
  await up.flush();
  assert.equal((up as unknown as { invalidCount: () => number }).invalidCount(), 1);
});

test('flush is a no-op with an empty buffer', async () => {
  const up = makeUploader();
  await up.flush();
  assert.equal(sent.length, 0);
});
