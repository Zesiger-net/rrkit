import type { TrackerConfigResponse } from '@rrkit/shared';

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
    return (await res.json()) as TrackerConfigResponse;
  } catch {
    return null;
  }
}
