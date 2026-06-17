import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminHeaders,
  createTestApp,
  ingestHeaders,
  loginCookie,
  seedCompleteSetup,
  setS3ValidateResult,
  VALID_S3_CONFIG,
  type TestApp,
} from './harness';
import { settingsRepo } from '../db/settings.repo';

function ev(timestamp: number): unknown {
  return { type: 3, data: { source: 1 }, timestamp };
}

async function completedApp(): Promise<{ t: TestApp; ingestKey: string; cookie: string }> {
  const t = await createTestApp();
  const { ingestKey } = seedCompleteSetup(t);
  const cookie = await loginCookie(t.app, 'admin-password-123');
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  return { t, ingestKey, cookie };
}

async function startWithChunks(t: TestApp, ingestKey: string, chunks: unknown[][]): Promise<string> {
  const start = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/start',
    headers: ingestHeaders(ingestKey),
    payload: {},
  });
  const id = start.json().sessionId as string;
  let seq = 0;
  for (const events of chunks) {
    await t.app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: ingestHeaders(ingestKey),
      payload: { sessionId: id, seq: seq++, events },
    });
  }
  return id;
}

test('a single corrupt S3 chunk is skipped; the rest of the replay still loads', async () => {
  const { t, ingestKey, cookie } = await completedApp();
  const id = await startWithChunks(t, ingestKey, [[ev(1), ev(2)], [ev(3)]]);

  // Corrupt the first chunk's stored bytes.
  const firstKey = [...t.s3.store.keys()].find((k) => k.includes('/events/') && k.includes('-0.json'))!;
  t.s3.store.set(firstKey, Buffer.from('{ this is not valid json'));

  const res = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${id}/events`,
    headers: adminHeaders(cookie),
  });
  assert.equal(res.statusCode, 200);
  // The good chunk (timestamp 3) survives; the corrupt one is dropped, not 500.
  assert.deepEqual(
    res.json().events.map((e: { timestamp: number }) => e.timestamp),
    [3],
  );
});

test('an S3 read outage returns 502 (not 500) on events/manifest/chunk', async () => {
  const { t, ingestKey, cookie } = await completedApp();
  const id = await startWithChunks(t, ingestKey, [[ev(1)]]);
  const chunkKey = [...t.s3.store.keys()].find((k) => k.includes('/events/'))!;

  t.s3.failReads = true;

  for (const url of [
    `/api/sessions/${id}/events`,
    `/api/sessions/${id}/manifest`,
    `/api/sessions/${id}/export`,
    `/api/sessions/${id}/chunk?key=${encodeURIComponent(chunkKey)}`,
  ]) {
    const res = await t.app.inject({ method: 'GET', url, headers: adminHeaders(cookie) });
    assert.equal(res.statusCode, 502, `expected 502 for ${url}, got ${res.statusCode}`);
  }
});

test('S3 connection test surfaces the validator result', async () => {
  const { t, cookie } = await completedApp();
  setS3ValidateResult({ ok: false, detail: 'bad creds' });
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/settings/storage/test',
    headers: adminHeaders(cookie),
    payload: { ...VALID_S3_CONFIG, secretAccessKey: 'whatever' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, false);
  assert.equal(res.json().detail, 'bad creds');
  setS3ValidateResult({ ok: true, detail: 'fake ok' });
});

test('metrics endpoint reports 0 before setup, full series after', async () => {
  const t = await createTestApp(); // setup NOT complete
  const before = await t.app.inject({ method: 'GET', url: '/api/metrics' });
  assert.equal(before.statusCode, 200);
  assert.match(before.body, /rrkit_setup_complete 0/);

  seedCompleteSetup(t);
  const after = await t.app.inject({ method: 'GET', url: '/api/metrics' });
  assert.match(after.body, /rrkit_setup_complete 1/);
  assert.match(after.body, /rrkit_sessions_total 0/);
});
