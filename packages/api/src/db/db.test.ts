import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from './connection';
import { runMigrations } from './migrate';
import { sessionsRepo } from './sessions.repo';
import { signalsRepo } from './signals.repo';
import { settingsRepo } from './settings.repo';

before(() => {
  initDb(':memory:');
  runMigrations(getDb());
});

function makeSession(id: string, metadata: Record<string, string | number | boolean> | null) {
  return sessionsRepo.create({
    id,
    ingestKey: 'k',
    ip: '1.2.3.4',
    uaBrowser: 'Chrome',
    uaOs: 'macOS',
    uaDevice: 'Desktop',
    screenW: 1920,
    screenH: 1080,
    viewportW: 1280,
    viewportH: 720,
    url: 'https://example.com',
    metadata,
  });
}

test('migrations create the sessions triage columns (starred/note)', () => {
  const s = makeSession('rrk_s_a', null);
  assert.equal(s.starred, false);
  assert.equal(s.note, null);
});

test('sessionsRepo.update sets star and note', () => {
  makeSession('rrk_s_b', null);
  sessionsRepo.update('rrk_s_b', { starred: true, note: 'look here' });
  const s = sessionsRepo.get('rrk_s_b');
  assert.equal(s?.starred, true);
  assert.equal(s?.note, 'look here');
});

test('findByMetadataValue matches the stored JSON metadata (erasure)', () => {
  makeSession('rrk_s_c', { user_id: 'u-42' });
  makeSession('rrk_s_d', { user_id: 'u-99' });
  const found = sessionsRepo.findByMetadataValue('user_id', 'u-42');
  assert.equal(found.length, 1);
  assert.equal(found[0].id, 'rrk_s_c');
});

test('signalsRepo groups error issues and counts frustration', () => {
  signalsRepo.insertMany('rrk_s_a', [
    { kind: 'error', fingerprint: 'fp1', message: 'Boom', ts: 1 },
    { kind: 'error', fingerprint: 'fp1', message: 'Boom', ts: 2 },
    { kind: 'rage', fingerprint: null, message: 'button', ts: 3 },
    { kind: 'deadclick', fingerprint: null, message: 'div', ts: 4 },
  ]);
  const issues = signalsRepo.listIssues();
  const fp1 = issues.find((i) => i.fingerprint === 'fp1');
  assert.ok(fp1);
  assert.equal(fp1!.count, 2);
  assert.equal(fp1!.sessions, 1);

  const f = signalsRepo.frustration();
  assert.equal(f.errors, 2);
  assert.equal(f.errorIssues, 1);
  assert.equal(f.rage, 1);
  assert.equal(f.deadclick, 1);
});

test('deleteForSession removes a session’s signals', () => {
  signalsRepo.deleteForSession('rrk_s_a');
  const f = signalsRepo.frustration();
  assert.equal(f.errors, 0);
});

test('settings groups round-trip and fill defaults for legacy rows', () => {
  settingsRepo.setNetwork({
    recordHeaders: true,
    recordBody: true,
    maxBodyBytes: 2048,
    contentTypeAllowlist: ['application/json'],
    urlAllowlist: [],
    urlBlocklist: [],
    redactHeaders: ['authorization'],
    redactBodyKeys: ['password'],
  });
  assert.equal(settingsRepo.getNetwork().recordBody, true);
  // A group never written returns full defaults.
  assert.equal(settingsRepo.getFeatures().webVitals, false);
  assert.equal(settingsRepo.getCanvas().format, 'webp');
});
