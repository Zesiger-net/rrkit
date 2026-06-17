import type { MetadataValue } from '@rrkit/shared';

/** Minimal rrweb event envelope (we only store/forward it). */
export interface AnyEvent {
  type: number;
  data: unknown;
  timestamp: number;
}

export interface RrkitConfig {
  /** Ingest key from the dashboard integration page. */
  key: string;
  /** Instance URL, e.g. https://replay.example.com (no trailing slash needed). */
  host: string;
  /** Override the masking default (otherwise the server's privacy setting wins). */
  maskAllInputs?: boolean;
  /** Override upload cadence (ms). */
  uploadIntervalMs?: number;
  /** Override the size threshold that forces a flush (bytes). */
  flushThresholdBytes?: number;
  /** Skip recording on routes whose pathname matches any of these. */
  excludeRoutes?: Array<string | RegExp>;
}

export type Metadata = Record<string, MetadataValue>;
