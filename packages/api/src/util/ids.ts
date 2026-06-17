import { randomBytes } from 'node:crypto';
import { SESSION_ID_PREFIX } from '@rrkit/shared';

export function generateSessionId(): string {
  return SESSION_ID_PREFIX + randomBytes(16).toString('hex');
}

export function generateIngestKey(): string {
  return 'rrk_ik_' + randomBytes(24).toString('hex');
}

export function generateSecret(): string {
  return randomBytes(48).toString('hex');
}
