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
  if (ip.includes(':')) return anonymizeIpv6(ip);
  return ip;
}

/**
 * Keep the first three IPv6 groups (~/48) and zero the rest. `::` is expanded
 * first so suffix bits are never mistaken for prefix bits — e.g.
 * `2001:db8::1` → `2001:db8:0::`, not `2001:db8:1::`.
 */
function anonymizeIpv6(ip: string): string {
  const addr = ip.replace(/%.*$/, '').replace(/^\[|\]$/g, ''); // strip zone id / brackets
  let groups: string[];
  if (addr.includes('::')) {
    const [head, tail] = addr.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return ip; // malformed — leave untouched
    groups = [...headParts, ...Array(missing).fill('0'), ...tailParts];
  } else {
    groups = addr.split(':');
  }
  if (groups.length !== 8) return ip; // not a clean address — don't guess
  return `${groups.slice(0, 3).join(':')}::`;
}

/** Apply the configured IP privacy policy. Returns null when IP must be dropped. */
export function applyIpPrivacy(ip: string | null, privacy: Privacy): string | null {
  if (!ip) return null;
  if (privacy.dropIp) return null;
  if (privacy.anonymizeIp) return anonymizeIp(ip);
  return ip;
}
