import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymizeIp } from './ip';
import { RateLimiter } from './ingestGuard';
import { hashPassword, verifyPassword } from './password';
import { errorFingerprint } from './fingerprint';

/* ---- anonymizeIp: IPv6 compression must not leak suffix bits ---- */

test('anonymizeIp expands :: before truncating (no suffix bleak)', () => {
  // 2001:db8::1 has zero-groups in the middle; the kept /48 must be the prefix.
  assert.equal(anonymizeIp('2001:db8::1'), '2001:db8:0::');
  assert.equal(anonymizeIp('2001:db8:85a3::8a2e:370:7334'), '2001:db8:85a3::');
  assert.equal(anonymizeIp('2001:db8:85a3:1:2:3:4:5'), '2001:db8:85a3::');
});

test('anonymizeIp handles loopback and zone ids without throwing', () => {
  assert.equal(anonymizeIp('::1'), '0:0:0::');
  assert.equal(anonymizeIp('fe80::1%eth0'), 'fe80:0:0::');
});

test('anonymizeIp leaves malformed input untouched', () => {
  assert.equal(anonymizeIp('not-an-ip'), 'not-an-ip');
  assert.equal(anonymizeIp('1:2:3'), '1:2:3'); // too few groups, no ::
});

/* ---- verifyPassword: corrupt hashes must fail closed, never throw ---- */

test('verifyPassword round-trips a real hash', () => {
  const h = hashPassword('correct horse battery staple');
  assert.equal(verifyPassword('correct horse battery staple', h), true);
  assert.equal(verifyPassword('wrong', h), false);
});

test('verifyPassword returns false (not throws) on malformed hashes', () => {
  for (const bad of [
    '',
    'plaintext',
    'scrypt$only$three',
    'scrypt$NaN$8$1$00$00', // non-numeric param
    'scrypt$16384$8$1$zz$zz', // invalid hex
    'scrypt$16384$8$1$00$', // empty hash
    'bcrypt$16384$8$1$00$00', // wrong scheme
  ]) {
    assert.equal(verifyPassword('x', bad), false, `should be false for: ${bad}`);
  }
});

/* ---- RateLimiter: keys must be evicted so the map can't grow unbounded ---- */

function mapSize(rl: RateLimiter): number {
  return (rl as unknown as { hits: Map<string, number[]> }).hits.size;
}

test('RateLimiter evicts keys whose timestamps have all aged out', () => {
  const rl = new RateLimiter(1000);
  rl.allow('a', 5, 1000);
  rl.allow('b', 5, 1000);
  assert.equal(mapSize(rl), 2);
  // A request a full window later triggers the sweep, which drops a + b.
  rl.allow('c', 5, 2500);
  assert.equal(mapSize(rl), 1);
});

test('RateLimiter keeps still-active keys during a sweep', () => {
  const rl = new RateLimiter(1000);
  rl.allow('a', 5, 1000);
  rl.allow('a', 5, 1900); // refresh a within window
  rl.allow('b', 5, 2100); // sweep runs; a has a recent (1900) ts so it stays
  assert.equal(mapSize(rl), 2);
});

/* ---- errorFingerprint: stable + unicode-safe ---- */

test('errorFingerprint is deterministic and unicode-safe', () => {
  const a = errorFingerprint('Boom 💥 at user 42', 'at f (x.js:1:2)');
  const b = errorFingerprint('Boom 💥 at user 99', 'at f (x.js:5:9)');
  // Numbers/positions normalized away → same group; emoji preserved deterministically.
  assert.equal(a, b);
  assert.equal(errorFingerprint('Boom 💥 at user 42', 'at f (x.js:1:2)'), a);
  assert.notEqual(errorFingerprint('Totally different', ''), a);
});
