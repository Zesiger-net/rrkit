import type { TrackerConfigResponse } from '@rrkit/shared';

/** Setting groups the recorder dereferences; all must be present to record. */
const REQUIRED_GROUPS = [
  'features',
  'privacy',
  'canvas',
  'frustration',
  'volume',
  'dom',
  'console',
  'upload',
  'network',
  'sampling',
] as const;

/**
 * Shallow shape check so an incomplete/old/proxy-mangled response fails closed
 * (returns null → "not recording") instead of throwing a TypeError deep in the
 * recorder when a missing group is dereferenced.
 */
function isValidConfig(c: unknown): c is TrackerConfigResponse {
  if (!c || typeof c !== 'object') return false;
  const obj = c as Record<string, unknown>;
  for (const g of REQUIRED_GROUPS) {
    if (!obj[g] || typeof obj[g] !== 'object') return false;
  }
  return typeof obj.maxBatchBytes === 'number' && Array.isArray(obj.metadataKeys);
}

/** Fetch the enabled-feature config. Returns null on any failure (fail-closed). */
export async function fetchConfig(
  host: string,
  key: string,
): Promise<TrackerConfigResponse | null> {
  try {
    const res = await fetch(`${host}/api/config?key=${encodeURIComponent(key)}`, {
      method: 'GET',
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isValidConfig(data) ? data : null;
  } catch {
    return null;
  }
}
