import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from './connection';
import { runMigrations } from './migrate';
import { sessionsRepo } from './sessions.repo';
import { settingsRepo } from './settings.repo';

before(() => {
  initDb(':memory:');
  runMigrations(getDb());
});

function corruptSetting(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

test('a corrupt settings row falls back to defaults instead of crashing', () => {
  corruptSetting('features', '{ this is not json');
  // Must not throw; should return the schema defaults.
  const features = settingsRepo.getFeatures();
  assert.equal(features.console, true);
  assert.equal(features.webVitals, false);
});

test('a corrupt auth/s3 row reads as absent (boot resilience)', () => {
  corruptSetting('auth', '}{');
  corruptSetting('s3', 'not json at all');
  assert.equal(settingsRepo.getAuth(), null);
  assert.equal(settingsRepo.getS3(), null);
});

test('a corrupt retention row falls back to the default', () => {
  corruptSetting('retention', '<<<');
  assert.equal(settingsRepo.getRetention().days, 30);
});

test('a session with corrupt metadata reads back as null, no crash', () => {
  const id = 'rrk_s_corrupt';
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
    metadata: { user_id: 'u-1' },
  });
  // Corrupt the stored metadata directly.
  getDb().prepare('UPDATE sessions SET metadata = ? WHERE id = ?').run('{ broken', id);

  const s = sessionsRepo.get(id);
  assert.ok(s);
  assert.equal(s!.metadata, null);

  // list() must not throw either.
  assert.doesNotThrow(() => sessionsRepo.list({ page: 1, pageSize: 25 }));

  // mergeMetadata over corrupt existing metadata must not throw and should
  // recover by writing a clean object.
  assert.doesNotThrow(() => sessionsRepo.mergeMetadata(id, { user_id: 'u-2' }));
  assert.equal(sessionsRepo.get(id)!.metadata!.user_id, 'u-2');
});
