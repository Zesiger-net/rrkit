import type { Metadata } from '../types';

const SID_KEY = 'rrkit_sid';

export function getStoredSid(): string | null {
  try {
    return sessionStorage.getItem(SID_KEY);
  } catch {
    return null;
  }
}

export function storeSid(id: string): void {
  try {
    sessionStorage.setItem(SID_KEY, id);
  } catch {
    /* sessionStorage unavailable (private mode); record without persistence */
  }
}

export function clearSid(): void {
  try {
    sessionStorage.removeItem(SID_KEY);
  } catch {
    /* ignore */
  }
}

export interface StartPayload {
  key: string;
  screen: { w: number; h: number };
  viewport: { w: number; h: number };
  url: string;
  metadata?: Metadata;
}

/** Create a new server-side session. Returns its id, or null on failure. */
export async function createSession(host: string, payload: StartPayload): Promise<string | null> {
  try {
    const res = await fetch(`${host}/api/ingest/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sessionId?: string };
    return data.sessionId ?? null;
  } catch {
    return null;
  }
}
