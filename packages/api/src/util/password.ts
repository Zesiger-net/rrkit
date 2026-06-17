import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// scrypt parameters (node:crypto, no native dependency beyond Node itself).
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  // A corrupt hash (bad params/hex) must fail closed, not throw a 500.
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P)) return false;
  try {
    const salt = Buffer.from(saltHex!, 'hex');
    const expected = Buffer.from(hashHex!, 'hex');
    if (expected.length === 0) return false;
    const actual = scryptSync(password, salt, expected.length, { N, r: R, p: P, maxmem: MAXMEM });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
