import { INGEST_KEY_HEADER } from '@rrkit/shared/constants';
import type { AnyEvent, Metadata } from '../types';

export interface UploaderOptions {
  host: string;
  key: string;
  intervalMs: number;
  thresholdBytes: number;
  getSessionId: () => string | null;
  /** Called when the server reports the session is gone (404/409). */
  onInvalidSession: () => void;
}

export class Uploader {
  private buffer: AnyEvent[] = [];
  private size = 0;
  private seq = 0;
  private pendingMeta: Metadata = {};
  private timer: ReturnType<typeof setInterval> | undefined;
  private sending = false;

  constructor(private readonly opts: UploaderOptions) {}

  start(): void {
    this.timer = setInterval(() => void this.flush(), this.opts.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  resetSeq(): void {
    this.seq = 0;
    this.buffer = [];
    this.size = 0;
    this.pendingMeta = {};
  }

  setMetadata(delta: Metadata): void {
    Object.assign(this.pendingMeta, delta);
  }

  enqueue(event: AnyEvent): void {
    this.buffer.push(event);
    this.size += approxSize(event);
    if (this.size >= this.opts.thresholdBytes) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.sending) return;
    const sessionId = this.opts.getSessionId();
    if (!sessionId || this.buffer.length === 0) return;

    this.sending = true;
    const events = this.buffer;
    const meta = this.pendingMeta;
    const seq = this.seq;
    this.buffer = [];
    this.size = 0;
    this.pendingMeta = {};

    try {
      const res = await fetch(`${this.opts.host}/api/ingest/events`, {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json', [INGEST_KEY_HEADER]: this.opts.key },
        body: JSON.stringify({
          key: this.opts.key,
          sessionId,
          seq,
          events,
          metadataDelta: Object.keys(meta).length ? meta : undefined,
        }),
      });
      if (res.status === 404 || res.status === 409) {
        this.opts.onInvalidSession();
      } else if (!res.ok) {
        this.requeue(events, meta);
      } else {
        this.seq += 1;
      }
    } catch {
      this.requeue(events, meta);
    } finally {
      this.sending = false;
    }
  }

  /** Synchronous best-effort flush on page hide. */
  beaconFlush(): void {
    const sessionId = this.opts.getSessionId();
    if (!sessionId || this.buffer.length === 0) return;
    const events = this.buffer;
    const meta = this.pendingMeta;
    const seq = this.seq;
    this.buffer = [];
    this.size = 0;
    this.pendingMeta = {};
    this.seq += 1;
    this.sendBeacon(`${this.opts.host}/api/ingest/events`, {
      key: this.opts.key,
      sessionId,
      seq,
      events,
      metadataDelta: Object.keys(meta).length ? meta : undefined,
    });
  }

  end(): void {
    const sessionId = this.opts.getSessionId();
    if (!sessionId) return;
    this.sendBeacon(`${this.opts.host}/api/ingest/end`, { key: this.opts.key, sessionId });
  }

  private sendBeacon(url: string, payload: unknown): void {
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    } catch {
      /* ignore — best effort */
    }
  }

  private requeue(events: AnyEvent[], meta: Metadata): void {
    // Put failed events back at the front; keep the same seq for the retry.
    this.buffer = events.concat(this.buffer);
    for (const e of events) this.size += approxSize(e);
    Object.assign(this.pendingMeta, meta);
  }
}

function approxSize(event: AnyEvent): number {
  try {
    return JSON.stringify(event).length;
  } catch {
    return 256;
  }
}
