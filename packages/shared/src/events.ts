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
  startTs: number;
  durationMs: number;
  reqSize?: number;
  resSize?: number;
  error?: boolean;
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
