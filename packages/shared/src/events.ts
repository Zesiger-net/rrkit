import { z } from 'zod';

/**
 * rrweb event shape. rrweb owns the detailed per-type schema; we only need the
 * envelope (type/data/timestamp) to store, merge, and replay events.
 */
export const RrwebEventSchema = z
  .object({
    type: z.number(),
    data: z.unknown(),
    timestamp: z.number(),
  })
  .passthrough();

export type RrwebEvent = z.infer<typeof RrwebEventSchema>;

/** Payload of a `rrkit/console` custom event. */
export interface ConsoleEventPayload {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: string[];
}

/** Payload of a `rrkit/network` custom event. */
export interface NetworkEventPayload {
  initiator: 'fetch' | 'xhr';
  method: string;
  url: string;
  status: number;
  statusText?: string;
  startTs: number;
  durationMs: number;
  reqSize?: number;
  resSize?: number;
  error?: boolean;
  /** Captured (and redacted) request/response headers, when enabled. */
  reqHeaders?: Record<string, string>;
  resHeaders?: Record<string, string>;
  /** Captured (and redacted, truncated) bodies, when enabled. */
  reqBody?: string;
  resBody?: string;
  /** True when a body was cut off at the configured size cap. */
  reqBodyTruncated?: boolean;
  resBodyTruncated?: boolean;
}

/** Payload of a `rrkit/error` custom event. */
export interface ErrorEventPayload {
  kind: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
}

/** Payload of a `rrkit/rage` custom event (rapid repeated clicks). */
export interface RageEventPayload {
  x: number;
  y: number;
  count: number;
  selector: string;
}

/** Payload of a `rrkit/deadclick` custom event (click with no effect). */
export interface DeadClickEventPayload {
  x: number;
  y: number;
  selector: string;
}

/** Payload of a `rrkit/vital` custom event (a Core Web Vitals sample). */
export interface WebVitalEventPayload {
  name: 'LCP' | 'CLS' | 'FCP' | 'TTFB';
  value: number;
}
