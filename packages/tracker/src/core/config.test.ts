import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchConfig } from './config';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(impl: () => { ok: boolean; status?: number; body: unknown }): void {
  globalThis.fetch = (async () => {
    const { ok, status = ok ? 200 : 500, body } = impl();
    return {
      ok,
      status,
      json: async () => body,
    } as unknown as Response;
  }) as typeof fetch;
}

function fullConfig(): Record<string, unknown> {
  return {
    features: {},
    privacy: {},
    canvas: {},
    frustration: {},
    volume: {},
    dom: {},
    console: {},
    upload: { uploadIntervalMs: 5000, flushThresholdBytes: 1024 },
    network: {},
    sampling: {},
    metadataKeys: [],
    maxBatchBytes: 8388608,
  };
}

test('fetchConfig returns the config when the shape is complete', async () => {
  stubFetch(() => ({ ok: true, body: fullConfig() }));
  const cfg = await fetchConfig('https://h', 'k');
  assert.ok(cfg);
  assert.equal(cfg!.maxBatchBytes, 8388608);
});

test('fetchConfig returns null on a non-2xx response', async () => {
  stubFetch(() => ({ ok: false, status: 401, body: {} }));
  assert.equal(await fetchConfig('https://h', 'k'), null);
});

test('fetchConfig returns null when a required group is missing', async () => {
  const partial = fullConfig();
  delete partial.upload; // recorder would dereference server.upload.*
  stubFetch(() => ({ ok: true, body: partial }));
  assert.equal(await fetchConfig('https://h', 'k'), null);
});

test('fetchConfig returns null when a group is the wrong type', async () => {
  const bad = fullConfig();
  bad.privacy = 'oops';
  stubFetch(() => ({ ok: true, body: bad }));
  assert.equal(await fetchConfig('https://h', 'k'), null);
});

test('fetchConfig returns null when metadataKeys/maxBatchBytes are missing', async () => {
  const bad = fullConfig();
  delete bad.metadataKeys;
  stubFetch(() => ({ ok: true, body: bad }));
  assert.equal(await fetchConfig('https://h', 'k'), null);
});

test('fetchConfig returns null when fetch throws', async () => {
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  assert.equal(await fetchConfig('https://h', 'k'), null);
});

test('fetchConfig returns null when the body is not an object', async () => {
  stubFetch(() => ({ ok: true, body: null }));
  assert.equal(await fetchConfig('https://h', 'k'), null);
});
