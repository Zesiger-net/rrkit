import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_EVENT_TAGS } from '@rrkit/shared';
import {
  adminHeaders,
  createTestApp,
  ingestHeaders,
  loginCookie,
  seedCompleteSetup,
  type TestApp,
} from './harness';
import { settingsRepo } from '../db/settings.repo';

/** A normal (non-custom) rrweb event. */
function ev(timestamp: number, type = 3): unknown {
  return { type, data: { source: 1 }, timestamp };
}
/** A custom rrweb error event the signal extractor will index. */
function errorEvent(timestamp: number, message: string): unknown {
  return {
    type: 5,
    data: { tag: CUSTOM_EVENT_TAGS.error, payload: { kind: 'error', message, stack: `at f (a.js:1:2)` } },
    timestamp,
  };
}

async function completedApp(): Promise<{ t: TestApp; ingestKey: string; password: string }> {
  const t = await createTestApp();
  const { password, ingestKey } = seedCompleteSetup(t);
  return { t, ingestKey, password };
}

async function startSession(
  t: TestApp,
  ingestKey: string,
  body: Record<string, unknown> = {},
): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/start',
    headers: ingestHeaders(ingestKey),
    payload: body,
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().sessionId as string;
}

/* ------------------------------------------------------------------ *
 * Tracker config
 * ------------------------------------------------------------------ */

test('config requires a valid ingest key and returns the full payload', async () => {
  const { t, ingestKey } = await completedApp();

  const noKey = await t.app.inject({ method: 'GET', url: '/api/config' });
  assert.equal(noKey.statusCode, 401);

  const badKey = await t.app.inject({
    method: 'GET',
    url: '/api/config',
    headers: ingestHeaders('rrk_ik_wrong'),
  });
  assert.equal(badKey.statusCode, 401);

  const ok = await t.app.inject({
    method: 'GET',
    url: '/api/config',
    headers: ingestHeaders(ingestKey),
  });
  assert.equal(ok.statusCode, 200);
  const cfg = ok.json();
  for (const k of [
    'features',
    'privacy',
    'canvas',
    'frustration',
    'volume',
    'dom',
    'console',
    'upload',
    'network',
    'sampling',
    'metadataKeys',
    'maxBatchBytes',
  ]) {
    assert.ok(k in cfg, `config missing ${k}`);
  }
  // Back-compat mirror fields.
  assert.equal(cfg.uploadIntervalMs, cfg.upload.uploadIntervalMs);
});

test('config accepts the ingest key via ?key= query (sendBeacon path)', async () => {
  const { t, ingestKey } = await completedApp();
  const res = await t.app.inject({
    method: 'GET',
    url: `/api/config?key=${ingestKey}`,
  });
  assert.equal(res.statusCode, 200);
});

/* ------------------------------------------------------------------ *
 * Ingest lifecycle
 * ------------------------------------------------------------------ */

test('ingest requires a valid key', async () => {
  const { t } = await completedApp();
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/start',
    payload: {},
  });
  assert.equal(res.statusCode, 401);
});

test('full ingest lifecycle: start → events (stored in S3) → end (kept)', async () => {
  const { t, ingestKey } = await completedApp();
  // keep everything
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });

  const id = await startSession(t, ingestKey, {
    url: 'https://shop.example.com/cart',
    screen: { w: 1920, h: 1080 },
    viewport: { w: 1280, h: 720 },
    metadata: { user_id: 'u-1' },
  });
  assert.ok(id.startsWith('rrk_s_'));

  // a metadata.json object was written
  assert.ok(t.s3.store.has(`${id}/metadata.json`));

  const events = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id, seq: 0, events: [ev(1), ev(2), errorEvent(3, 'Boom')] },
  });
  assert.equal(events.statusCode, 200);

  // chunk stored in S3
  const chunkKeys = [...t.s3.store.keys()].filter((k) => k.startsWith(`${id}/events/`));
  assert.equal(chunkKeys.length, 1);

  const end = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/end',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id },
  });
  assert.equal(end.statusCode, 200);

  // session kept + counters bumped
  const cookie = await loginCookie(t.app, 'admin-password-123');
  const detail = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${id}`,
    headers: adminHeaders(cookie),
  });
  assert.equal(detail.statusCode, 200);
  const s = detail.json();
  assert.equal(s.status, 'completed');
  assert.equal(s.event_count, 3);
  assert.equal(s.chunk_count, 1);
  assert.equal(s.metadata.user_id, 'u-1');
});

test('end discards a too-short session (default keep policy) and cleans S3', async () => {
  const { t, ingestKey } = await completedApp();
  const id = await startSession(t, ingestKey);
  await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id, seq: 0, events: [ev(1)] },
  });
  await t.app.inject({
    method: 'POST',
    url: '/api/ingest/end',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id },
  });

  const cookie = await loginCookie(t.app, 'admin-password-123');
  const detail = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${id}`,
    headers: adminHeaders(cookie),
  });
  assert.equal(detail.statusCode, 404);
  // S3 objects for the discarded session are gone
  assert.equal([...t.s3.store.keys()].filter((k) => k.startsWith(`${id}/`)).length, 0);
});

test('events for an unknown session → 404; for an ended session → 409', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });

  const unknown = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: 'rrk_s_does_not_exist', seq: 0, events: [ev(1)] },
  });
  assert.equal(unknown.statusCode, 404);

  const id = await startSession(t, ingestKey);
  await t.app.inject({
    method: 'POST',
    url: '/api/ingest/end',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id },
  });
  const afterEnd = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id, seq: 1, events: [ev(5)] },
  });
  assert.equal(afterEnd.statusCode, 409);
});

test('a storage failure on events returns 502', async () => {
  const { t, ingestKey } = await completedApp();
  const id = await startSession(t, ingestKey);
  t.s3.failWrites = true;
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id, seq: 0, events: [ev(1)] },
  });
  assert.equal(res.statusCode, 502);
});

test('ingest validation: empty events array is rejected', async () => {
  const { t, ingestKey } = await completedApp();
  const id = await startSession(t, ingestKey);
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id, seq: 0, events: [] },
  });
  assert.equal(res.statusCode, 400);
});

test('only declared metadata keys (plus user_id) are persisted', async () => {
  const { t, ingestKey } = await completedApp();
  // declare "plan" as a field
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  const cookie = await loginCookie(t.app, 'admin-password-123');
  await t.app.inject({
    method: 'PUT',
    url: '/api/settings/metadata',
    headers: adminHeaders(cookie),
    payload: { fields: [{ key: 'plan', label: 'Plan', type: 'string', filterable: true }] },
  });

  const id = await startSession(t, ingestKey, {
    metadata: { user_id: 'u-9', plan: 'pro', evil: 'should-be-dropped' },
  });
  const detail = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${id}`,
    headers: adminHeaders(cookie),
  });
  const meta = detail.json().metadata;
  assert.equal(meta.user_id, 'u-9');
  assert.equal(meta.plan, 'pro');
  assert.equal('evil' in meta, false);
});

/* ------------------------------------------------------------------ *
 * Security: origin allowlist + rate limit
 * ------------------------------------------------------------------ */

test('origin allowlist blocks disallowed origins with 403', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSecurity({ allowedOrigins: ['https://good.example.com'], ingestRatePerMin: 0 });

  const blocked = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/start',
    headers: { ...ingestHeaders(ingestKey), origin: 'https://evil.example.com' },
    payload: {},
  });
  assert.equal(blocked.statusCode, 403);

  const allowed = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/start',
    headers: { ...ingestHeaders(ingestKey), origin: 'https://good.example.com' },
    payload: {},
  });
  assert.equal(allowed.statusCode, 200);
});

test('per-IP ingest rate limit returns 429 past the cap', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSecurity({ allowedOrigins: [], ingestRatePerMin: 2 });

  const hit = () =>
    t.app.inject({
      method: 'POST',
      url: '/api/ingest/start',
      headers: ingestHeaders(ingestKey),
      remoteAddress: '203.0.113.5',
      payload: {},
    });
  assert.equal((await hit()).statusCode, 200);
  assert.equal((await hit()).statusCode, 200);
  assert.equal((await hit()).statusCode, 429);
});

/* ------------------------------------------------------------------ *
 * Sessions list / filter / detail / export / triage / erasure
 * ------------------------------------------------------------------ */

test('sessions routes require admin auth', async () => {
  const { t } = await completedApp();
  const res = await t.app.inject({ method: 'GET', url: '/api/sessions' });
  assert.equal(res.statusCode, 401);
});

test('sessions list, stats, facets, filters and pagination', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  const cookie = await loginCookie(t.app, 'admin-password-123');

  // create 3 completed sessions
  for (let i = 0; i < 3; i++) {
    const id = await startSession(t, ingestKey, { url: `https://x/${i}` });
    await t.app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: ingestHeaders(ingestKey),
      payload: { sessionId: id, seq: 0, events: [ev(1), ev(2)] },
    });
    await t.app.inject({
      method: 'POST',
      url: '/api/ingest/end',
      headers: ingestHeaders(ingestKey),
      payload: { sessionId: id },
    });
  }

  const list = await t.app.inject({
    method: 'GET',
    url: '/api/sessions?page=1&pageSize=2',
    headers: adminHeaders(cookie),
  });
  assert.equal(list.statusCode, 200);
  const body = list.json();
  assert.equal(body.total, 3);
  assert.equal(body.items.length, 2);
  assert.equal(body.page, 1);

  const stats = await t.app.inject({
    method: 'GET',
    url: '/api/sessions/stats',
    headers: adminHeaders(cookie),
  });
  assert.equal(stats.json().total, 3);
  assert.equal(stats.json().completed, 3);

  const facets = await t.app.inject({
    method: 'GET',
    url: '/api/sessions/facets',
    headers: adminHeaders(cookie),
  });
  assert.ok(Array.isArray(facets.json().browser));

  // status filter
  const recording = await t.app.inject({
    method: 'GET',
    url: '/api/sessions?status=recording',
    headers: adminHeaders(cookie),
  });
  assert.equal(recording.json().total, 0);
});

test('events + export return ordered events from S3; export sets attachment header', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  const cookie = await loginCookie(t.app, 'admin-password-123');

  const id = await startSession(t, ingestKey);
  // two chunks, out of order timestamps within
  await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id, seq: 0, events: [ev(10), ev(5)] },
  });
  await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id, seq: 1, events: [ev(20)] },
  });

  const eventsRes = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${id}/events`,
    headers: adminHeaders(cookie),
  });
  assert.equal(eventsRes.statusCode, 200);
  const evs = eventsRes.json().events;
  assert.deepEqual(
    evs.map((e: { timestamp: number }) => e.timestamp),
    [5, 10, 20],
  );

  const exportRes = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${id}/export`,
    headers: adminHeaders(cookie),
  });
  assert.equal(exportRes.statusCode, 200);
  assert.match(exportRes.headers['content-disposition'] as string, /attachment/);
  assert.equal(exportRes.json().session.id, id);

  const manifest = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${id}/manifest`,
    headers: adminHeaders(cookie),
  });
  assert.equal(manifest.json().chunks.length, 2);
});

test('chunk route rejects keys outside the session prefix', async () => {
  const { t, ingestKey } = await completedApp();
  const cookie = await loginCookie(t.app, 'admin-password-123');
  const id = await startSession(t, ingestKey);
  const res = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${id}/chunk?key=other-session/events/chunk-1-0.json`,
    headers: adminHeaders(cookie),
  });
  assert.equal(res.statusCode, 400);
});

test('star/note PATCH and DELETE', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  const cookie = await loginCookie(t.app, 'admin-password-123');

  const id = await startSession(t, ingestKey);
  await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id, seq: 0, events: [ev(1)] },
  });
  await t.app.inject({
    method: 'POST',
    url: '/api/ingest/end',
    headers: ingestHeaders(ingestKey),
    payload: { sessionId: id },
  });

  const patched = await t.app.inject({
    method: 'PATCH',
    url: `/api/sessions/${id}`,
    headers: adminHeaders(cookie),
    payload: { starred: true, note: 'interesting' },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().starred, true);
  assert.equal(patched.json().note, 'interesting');

  const del = await t.app.inject({
    method: 'DELETE',
    url: `/api/sessions/${id}`,
    headers: adminHeaders(cookie),
  });
  assert.equal(del.statusCode, 200);
  const gone = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${id}`,
    headers: adminHeaders(cookie),
  });
  assert.equal(gone.statusCode, 404);
});

test('right-to-erasure deletes every session for a metadata value', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  const cookie = await loginCookie(t.app, 'admin-password-123');

  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    ids.push(await startSession(t, ingestKey, { metadata: { user_id: 'erase-me' } }));
  }
  const keep = await startSession(t, ingestKey, { metadata: { user_id: 'keep-me' } });

  const erase = await t.app.inject({
    method: 'POST',
    url: '/api/sessions/erase',
    headers: adminHeaders(cookie),
    payload: { key: 'user_id', value: 'erase-me' },
  });
  assert.equal(erase.statusCode, 200);
  assert.equal(erase.json().deleted, 2);

  for (const id of ids) {
    const r = await t.app.inject({
      method: 'GET',
      url: `/api/sessions/${id}`,
      headers: adminHeaders(cookie),
    });
    assert.equal(r.statusCode, 404);
  }
  const survivor = await t.app.inject({
    method: 'GET',
    url: `/api/sessions/${keep}`,
    headers: adminHeaders(cookie),
  });
  assert.equal(survivor.statusCode, 200);
});

/* ------------------------------------------------------------------ *
 * Signals → issues / frustration / metrics
 * ------------------------------------------------------------------ */

test('errors are indexed into issues + frustration + metrics', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  const cookie = await loginCookie(t.app, 'admin-password-123');

  const id = await startSession(t, ingestKey);
  await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: ingestHeaders(ingestKey),
    payload: {
      sessionId: id,
      seq: 0,
      events: [errorEvent(1, 'Cannot read x of undefined'), errorEvent(2, 'Cannot read x of undefined')],
    },
  });

  const issues = await t.app.inject({
    method: 'GET',
    url: '/api/sessions/issues',
    headers: adminHeaders(cookie),
  });
  assert.equal(issues.json().items.length, 1);
  assert.equal(issues.json().items[0].count, 2);

  const frustration = await t.app.inject({
    method: 'GET',
    url: '/api/sessions/frustration',
    headers: adminHeaders(cookie),
  });
  assert.equal(frustration.json().errors, 2);
  assert.equal(frustration.json().errorIssues, 1);

  const metrics = await t.app.inject({ method: 'GET', url: '/api/metrics' });
  assert.equal(metrics.statusCode, 200);
  assert.match(metrics.body, /rrkit_setup_complete 1/);
  assert.match(metrics.body, /rrkit_signals\{kind="error"\} 2/);
});

/* ------------------------------------------------------------------ *
 * Settings round-trips
 * ------------------------------------------------------------------ */

test('capture settings round-trip via API', async () => {
  const { t } = await completedApp();
  const cookie = await loginCookie(t.app, 'admin-password-123');

  const put = await t.app.inject({
    method: 'PUT',
    url: '/api/settings/capture',
    headers: adminHeaders(cookie),
    payload: {
      features: {
        console: true,
        network: true,
        canvas: true,
        errors: true,
        rage: true,
        deadClick: true,
        webVitals: true,
      },
      canvas: { fps: 4, quality: 0.4, format: 'jpeg' },
      retention: { days: 7 },
    },
  });
  assert.equal(put.statusCode, 200);

  const get = await t.app.inject({
    method: 'GET',
    url: '/api/settings/capture',
    headers: adminHeaders(cookie),
  });
  const cap = get.json();
  assert.equal(cap.features.canvas, true);
  assert.equal(cap.features.webVitals, true);
  assert.equal(cap.canvas.fps, 4);
  assert.equal(cap.canvas.format, 'jpeg');
  assert.equal(cap.retention.days, 7);
  // retention change synced to (fake) S3 lifecycle
  assert.equal(t.s3.lifecycleDays, 7);
});

test('capture settings reject out-of-range values', async () => {
  const { t } = await completedApp();
  const cookie = await loginCookie(t.app, 'admin-password-123');
  const res = await t.app.inject({
    method: 'PUT',
    url: '/api/settings/capture',
    headers: adminHeaders(cookie),
    payload: { canvas: { fps: 999, quality: 0.4, format: 'webp' } },
  });
  assert.equal(res.statusCode, 400);
});

test('storage settings: secret is never returned, blank secret keeps existing', async () => {
  const { t } = await completedApp();
  const cookie = await loginCookie(t.app, 'admin-password-123');

  const get = await t.app.inject({
    method: 'GET',
    url: '/api/settings/storage',
    headers: adminHeaders(cookie),
  });
  const storage = get.json();
  assert.equal('secretAccessKey' in storage, false);
  assert.equal(storage.secretSet, true);

  // PUT with blank secret keeps the existing one
  const put = await t.app.inject({
    method: 'PUT',
    url: '/api/settings/storage',
    headers: adminHeaders(cookie),
    payload: {
      endpoint: '',
      region: 'eu-west-1',
      bucket: 'new-bucket',
      accessKeyId: 'AKIA2',
      secretAccessKey: '',
      forcePathStyle: true,
    },
  });
  assert.equal(put.statusCode, 200);
  assert.equal(settingsRepo.getS3()?.secretAccessKey, 'secret-test');
  assert.equal(settingsRepo.getS3()?.bucket, 'new-bucket');
});

test('integration key rotation invalidates the old key', async () => {
  const { t, ingestKey } = await completedApp();
  const cookie = await loginCookie(t.app, 'admin-password-123');

  const rotate = await t.app.inject({
    method: 'POST',
    url: '/api/settings/integration/rotate',
    headers: adminHeaders(cookie),
  });
  assert.equal(rotate.statusCode, 200);
  const newKey = rotate.json().ingestKey;
  assert.notEqual(newKey, ingestKey);

  // old key no longer works
  const oldKey = await t.app.inject({
    method: 'GET',
    url: '/api/config',
    headers: ingestHeaders(ingestKey),
  });
  assert.equal(oldKey.statusCode, 401);
  // new key works
  const newKeyRes = await t.app.inject({
    method: 'GET',
    url: '/api/config',
    headers: ingestHeaders(newKey),
  });
  assert.equal(newKeyRes.statusCode, 200);
});

test('filtering by a custom filterable metadata field (mf_ generated column)', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  const cookie = await loginCookie(t.app, 'admin-password-123');

  // Declare a filterable "plan" field — this adds the indexed mf_plan column.
  const declare = await t.app.inject({
    method: 'PUT',
    url: '/api/settings/metadata',
    headers: adminHeaders(cookie),
    payload: { fields: [{ key: 'plan', label: 'Plan', type: 'string', filterable: true }] },
  });
  assert.equal(declare.statusCode, 200);

  const proId = await startSession(t, ingestKey, { metadata: { user_id: 'a', plan: 'pro' } });
  await startSession(t, ingestKey, { metadata: { user_id: 'b', plan: 'free' } });

  const filtered = await t.app.inject({
    method: 'GET',
    url: '/api/sessions?mf_plan=pro',
    headers: adminHeaders(cookie),
  });
  assert.equal(filtered.statusCode, 200);
  assert.equal(filtered.json().total, 1);
  assert.equal(filtered.json().items[0].id, proId);

  // A non-existent / non-filterable key is ignored (returns everything, not an error).
  const ignored = await t.app.inject({
    method: 'GET',
    url: '/api/sessions?mf_unknownkey=x',
    headers: adminHeaders(cookie),
  });
  assert.equal(ignored.statusCode, 200);
  assert.equal(ignored.json().total, 2);
});

test('free-text search matches id and metadata values', async () => {
  const { t, ingestKey } = await completedApp();
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  const cookie = await loginCookie(t.app, 'admin-password-123');

  const id = await startSession(t, ingestKey, { metadata: { user_id: 'needle-123' } });
  await startSession(t, ingestKey, { metadata: { user_id: 'other-user' } });

  const res = await t.app.inject({
    method: 'GET',
    url: '/api/sessions?search=needle-123',
    headers: adminHeaders(cookie),
  });
  assert.equal(res.json().total, 1);
  assert.equal(res.json().items[0].id, id);
});

test('lifecycle status reflects the synced retention rule', async () => {
  const { t } = await completedApp();
  const cookie = await loginCookie(t.app, 'admin-password-123');
  await t.app.inject({
    method: 'PUT',
    url: '/api/settings/capture',
    headers: adminHeaders(cookie),
    payload: { retention: { days: 45 } },
  });
  const res = await t.app.inject({
    method: 'GET',
    url: '/api/settings/storage/lifecycle',
    headers: adminHeaders(cookie),
  });
  assert.equal(res.json().supported, true);
  assert.equal(res.json().days, 45);
});
