import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FeaturesSchema,
  DEFAULT_FEATURES,
  PrivacySchema,
  CanvasSettingsSchema,
  NetworkSettingsSchema,
  SamplingSettingsSchema,
  DEFAULT_CANVAS,
} from './settings.js';

test('FeaturesSchema fills new fields when parsing legacy rows', () => {
  // A row written before `rage`/`deadClick` existed.
  const legacy = { console: true, network: true, canvas: false, errors: true };
  const parsed = FeaturesSchema.parse(legacy);
  assert.equal(parsed.rage, true); // default on
  assert.equal(parsed.deadClick, false); // default off
  assert.equal(parsed.console, true);
});

test('DEFAULT_FEATURES matches schema defaults', () => {
  assert.deepEqual(DEFAULT_FEATURES, FeaturesSchema.parse({}));
});

test('Privacy defaults are privacy-safe', () => {
  const p = PrivacySchema.parse({});
  assert.equal(p.maskInputs, true);
  assert.deepEqual(p.maskInputTypes, ['password']);
  assert.equal(p.scrubPii, false);
});

test('Canvas defaults preserve prior hardcoded behavior', () => {
  assert.deepEqual(DEFAULT_CANVAS, { fps: 2, quality: 0.6, format: 'webp' });
  assert.equal(CanvasSettingsSchema.parse({}).format, 'webp');
});

test('Canvas rejects out-of-range quality', () => {
  assert.throws(() => CanvasSettingsSchema.parse({ quality: 5 }));
});

test('Network capture is off by default with safe redaction lists', () => {
  const n = NetworkSettingsSchema.parse({});
  assert.equal(n.recordBody, false);
  assert.equal(n.recordHeaders, false);
  assert.ok(n.redactHeaders.includes('authorization'));
  assert.ok(n.redactBodyKeys.includes('password'));
});

test('Sampling defaults record everyone', () => {
  const s = SamplingSettingsSchema.parse({});
  assert.equal(s.sessionSampleRate, 1);
  assert.equal(s.recordOnlyOnError, false);
});
