import {
  CUSTOM_EVENT_TAGS,
  type DeadClickEventPayload,
  type ErrorEventPayload,
  type RageEventPayload,
  type RrwebEvent,
} from '@rrkit/shared';
import { errorFingerprint } from './fingerprint';

export type SignalKind = 'error' | 'rage' | 'deadclick';

export interface ExtractedSignal {
  kind: SignalKind;
  fingerprint: string | null;
  message: string | null;
  ts: number;
}

/** rrweb EventType.Custom */
const CUSTOM = 5;

/**
 * Pull frustration/error signals out of an rrweb event batch so they can be
 * indexed in SQLite for cross-session querying (issues, frustration, alerts).
 */
export function extractSignals(events: RrwebEvent[]): ExtractedSignal[] {
  const out: ExtractedSignal[] = [];
  for (const ev of events) {
    if (ev.type !== CUSTOM) continue;
    const data = ev.data as { tag?: string; payload?: unknown } | undefined;
    if (!data || typeof data.tag !== 'string') continue;
    const ts = typeof ev.timestamp === 'number' ? ev.timestamp : 0;

    if (data.tag === CUSTOM_EVENT_TAGS.error) {
      const p = (data.payload ?? {}) as ErrorEventPayload;
      out.push({
        kind: 'error',
        fingerprint: errorFingerprint(p.message ?? '', p.stack),
        message: (p.message ?? '').slice(0, 500),
        ts,
      });
    } else if (data.tag === CUSTOM_EVENT_TAGS.rage) {
      const p = (data.payload ?? {}) as RageEventPayload;
      out.push({ kind: 'rage', fingerprint: null, message: p.selector ?? null, ts });
    } else if (data.tag === CUSTOM_EVENT_TAGS.deadClick) {
      const p = (data.payload ?? {}) as DeadClickEventPayload;
      out.push({ kind: 'deadclick', fingerprint: null, message: p.selector ?? null, ts });
    }
  }
  return out;
}
