import type { Privacy } from '@rrkit/shared';

/**
 * Anonymize an IP for GDPR: zero the last octet (IPv4) or drop the trailing
 * 80 bits (IPv6), keeping only coarse network locality.
 */
export function anonymizeIp(ip: string): string {
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    return ip;
  }
  if (ip.includes(':')) {
    const groups = ip.split(':').filter((g) => g.length > 0);
    return `${groups.slice(0, 3).join(':')}::`;
  }
  return ip;
}

/** Apply the configured IP privacy policy. Returns null when IP must be dropped. */
export function applyIpPrivacy(ip: string | null, privacy: Privacy): string | null {
  if (!ip) return null;
  if (privacy.dropIp) return null;
  if (privacy.anonymizeIp) return anonymizeIp(ip);
  return ip;
}
