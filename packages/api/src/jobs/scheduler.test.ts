import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyBaseLogger } from 'fastify';
import { initDb, getDb } from '../db/connection';
import { runMigrations } from '../db/migrate';
import { sessionsRepo } from '../db/sessions.repo';
import { signalsRepo } from '../db/signals.repo';
import { settingsRepo } from '../db/settings.repo';
import type { AppContext } from '../context';
import { runAlerts, runRetention, runStaleFinalize } from './scheduler';
import { FakeS3 } from '../test/harness';

const log = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  trace() {},
  fatal() {},
  child() {
    return log;
  },
} as unknown as FastifyBaseLogger;

let s3: FakeS3;
let ctx: AppContext;

before(() => {
  initDb(':memory:');
  runMigrations(getDb());
});

beforeEach(() => {
  getDb().exec(
    'DELETE FROM sessions; DELETE FROM session_signals; DELETE FROM alert_state; DELETE FROM settings;',
  );
  s3 = new FakeS3();
  s3.configure({} as never);
  ctx = { env: { version: 'test' } as AppContext['env'], s3 };
  settingsRepo.setSetup({ complete: true, passwordSet: true, s3Verified: true, metadataSet: true });
});

function makeSession(id: string, createdAgoMs: number, updatedAgoMs: number): void {
  sessionsRepo.create({
    id,
    ingestKey: 'k',
    ip: null,
    uaBrowser: null,
    uaOs: null,
    uaDevice: null,
    screenW: null,
    screenH: null,
    viewportW: null,
    viewportH: null,
    url: null,
    metadata: null,
  });
  const created = new Date(Date.now() - createdAgoMs).toISOString();
  const updated = new Date(Date.now() - updatedAgoMs).toISOString();
  getDb().prepare('UPDATE sessions SET created = ?, updated = ? WHERE id = ?').run(created, updated, id);
}

/* ---- retention ---- */

test('runRetention deletes sessions older than the retention window + their S3 objects', async () => {
  settingsRepo.setRetention({ days: 30 });
  makeSession('rrk_s_old', 40 * 86400_000, 40 * 86400_000);
  makeSession('rrk_s_new', 1 * 86400_000, 1 * 86400_000);
  await s3.putJson('rrk_s_old/events/chunk-1-0.json', [{ type: 3, timestamp: 1 }]);

  await runRetention(ctx, log);

  assert.equal(sessionsRepo.get('rrk_s_old'), null);
  assert.ok(sessionsRepo.get('rrk_s_new'));
  assert.equal([...s3.store.keys()].filter((k) => k.startsWith('rrk_s_old/')).length, 0);
});

test('runRetention is a no-op until setup completes', async () => {
  settingsRepo.setSetup({ complete: false, passwordSet: true, s3Verified: true, metadataSet: true });
  settingsRepo.setRetention({ days: 30 });
  makeSession('rrk_s_old', 40 * 86400_000, 40 * 86400_000);
  await runRetention(ctx, log);
  assert.ok(sessionsRepo.get('rrk_s_old')); // not deleted
});

/* ---- stale finalize + duration semantics ---- */

test('runStaleFinalize completes an idle recording session and excludes idle time from duration', async () => {
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  // 5s of activity, then 195s idle (well past the 90s stale cutoff).
  makeSession('rrk_s_stale', 200_000, 195_000);
  getDb().prepare('UPDATE sessions SET event_count = 10 WHERE id = ?').run('rrk_s_stale');

  await runStaleFinalize(ctx, log);

  const s = sessionsRepo.get('rrk_s_stale');
  assert.equal(s?.status, 'completed');
  // duration ≈ 5s (updated − created), NOT ≈ 200s (now − created).
  assert.ok(s!.duration_ms >= 3000 && s!.duration_ms <= 8000, `duration was ${s!.duration_ms}ms`);
});

test('runStaleFinalize discards an idle session that fails the keep policy', async () => {
  settingsRepo.setSessionPolicy({ minDurationMs: 20000, minEventCount: 30 });
  makeSession('rrk_s_junk', 200_000, 195_000);
  // below both thresholds
  getDb().prepare('UPDATE sessions SET event_count = 3, duration_ms = 1000 WHERE id = ?').run('rrk_s_junk');
  await s3.putJson('rrk_s_junk/events/chunk-1-0.json', [{ type: 3, timestamp: 1 }]);

  await runStaleFinalize(ctx, log);

  assert.equal(sessionsRepo.get('rrk_s_junk'), null);
  assert.equal([...s3.store.keys()].filter((k) => k.startsWith('rrk_s_junk/')).length, 0);
});

test('runStaleFinalize leaves fresh recording sessions alone', async () => {
  settingsRepo.setSessionPolicy({ minDurationMs: 0, minEventCount: 0 });
  makeSession('rrk_s_fresh', 30_000, 1_000); // updated 1s ago, not stale
  await runStaleFinalize(ctx, log);
  assert.equal(sessionsRepo.get('rrk_s_fresh')?.status, 'recording');
});

/* ---- alerts ---- */

let fetchStatus: number;
let fetchCalls: string[];
const realFetch = globalThis.fetch;

function stubWebhook(): void {
  fetchStatus = 200;
  fetchCalls = [];
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    fetchCalls.push(init.body);
    return { ok: fetchStatus >= 200 && fetchStatus < 300, status: fetchStatus } as Response;
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

function enableAlerts(): void {
  settingsRepo.setAlerts({
    enabled: true,
    webhookUrl: 'https://hook.example.com',
    errorSpikeThreshold: 50,
    notifyNewIssues: true,
    notifyRage: false,
  });
}

test('runAlerts notifies a new error issue once, then respects the cooldown', async () => {
  stubWebhook();
  enableAlerts();
  signalsRepo.insertMany('rrk_s_1', [{ kind: 'error', fingerprint: 'fpA', message: 'Boom', ts: 1 }]);

  await runAlerts(log);
  assert.equal(fetchCalls.length, 1);
  assert.ok(signalsRepo.getAlertState('fpA'));

  await runAlerts(log); // within cooldown
  assert.equal(fetchCalls.length, 1);
});

test('runAlerts does NOT record alert state when the webhook fails (so it retries)', async () => {
  stubWebhook();
  enableAlerts();
  fetchStatus = 500; // webhook down
  signalsRepo.insertMany('rrk_s_2', [{ kind: 'error', fingerprint: 'fpB', message: 'Crash', ts: 1 }]);

  await runAlerts(log);
  assert.equal(fetchCalls.length, 1); // attempted
  assert.equal(signalsRepo.getAlertState('fpB'), null); // not recorded → will retry

  fetchStatus = 200; // webhook recovers
  await runAlerts(log);
  assert.equal(fetchCalls.length, 2); // retried
  assert.ok(signalsRepo.getAlertState('fpB'));
});

test('runAlerts is disabled when no webhook is configured', async () => {
  stubWebhook();
  settingsRepo.setAlerts({
    enabled: true,
    webhookUrl: '',
    errorSpikeThreshold: 50,
    notifyNewIssues: true,
    notifyRage: false,
  });
  signalsRepo.insertMany('rrk_s_3', [{ kind: 'error', fingerprint: 'fpC', message: 'X', ts: 1 }]);
  await runAlerts(log);
  assert.equal(fetchCalls.length, 0);
});
