import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymizeIp, applyIpPrivacy } from './ip';
import { originAllowed, RateLimiter } from './ingestGuard';
import { DEFAULT_PRIVACY } from '@rrkit/shared';

test('anonymizeIp zeroes the last IPv4 octet', () => {
  assert.equal(anonymizeIp('203.0.113.42'), '203.0.113.0');
});

test('anonymizeIp truncates IPv6', () => {
  assert.equal(anonymizeIp('2001:db8:85a3:1:2:3:4:5'), '2001:db8:85a3::');
});

test('applyIpPrivacy honours dropIp and anonymizeIp', () => {
  assert.equal(applyIpPrivacy('1.2.3.4', { ...DEFAULT_PRIVACY, dropIp: true }), null);
  assert.equal(applyIpPrivacy('1.2.3.4', { ...DEFAULT_PRIVACY, anonymizeIp: true }), '1.2.3.0');
  assert.equal(applyIpPrivacy('1.2.3.4', DEFAULT_PRIVACY), '1.2.3.4');
  assert.equal(applyIpPrivacy(null, DEFAULT_PRIVACY), null);
});

test('originAllowed: empty allowlist allows all; otherwise exact match', () => {
  assert.equal(originAllowed('https://app.example.com', []), true);
  assert.equal(originAllowed('https://app.example.com', ['https://app.example.com']), true);
  assert.equal(originAllowed('https://evil.com', ['https://app.example.com']), false);
  assert.equal(originAllowed(undefined, ['https://app.example.com']), false);
});

test('RateLimiter enforces the per-window cap', () => {
  const rl = new RateLimiter(1000);
  const t = 10_000;
  assert.equal(rl.allow('ip', 2, t), true);
  assert.equal(rl.allow('ip', 2, t), true);
  assert.equal(rl.allow('ip', 2, t), false); // 3rd within window
  assert.equal(rl.allow('ip', 2, t + 1001), true); // window elapsed
});

test('RateLimiter with 0 cap is disabled (always allows)', () => {
  const rl = new RateLimiter();
  for (let i = 0; i < 100; i++) assert.equal(rl.allow('ip', 0), true);
});
