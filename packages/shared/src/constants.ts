/** Shared constants used across the API, tracker, and dashboard. */

/** Prefix for generated session ids (e.g. `rrk_s_ab12...`). */
export const SESSION_ID_PREFIX = 'rrk_s_';

/** A session must be at least this long to be kept (else discarded as noise). */
export const MIN_SESSION_DURATION_MS = 20_000;
/** A session must have at least this many events to be kept. */
export const MIN_SESSION_EVENT_COUNT = 30;

/** A `recording` session whose last update is older than this is finalized by the stale job. */
export const STALE_SESSION_MS = 60_000;

/** Default number of days to keep sessions before the retention job deletes them. */
export const DEFAULT_RETENTION_DAYS = 30;

/** Hard limit the server accepts for a single ingest batch body. */
export const MAX_BATCH_BYTES = 8 * 1024 * 1024;

/** Tracker defaults (overridable by the host dev via SDK config). */
export const DEFAULT_UPLOAD_INTERVAL_MS = 5_000;
export const DEFAULT_FLUSH_THRESHOLD_BYTES = 1024 * 1024;

/** Auth cookie name for the admin dashboard session. */
export const COOKIE_NAME = 'rrkit_token';

/** Header the tracker uses to present the ingest key. */
export const INGEST_KEY_HEADER = 'x-rrkit-key';

/** rrweb custom-event tags emitted by the tracker interceptors. */
export const CUSTOM_EVENT_TAGS = {
  console: 'rrkit/console',
  network: 'rrkit/network',
  error: 'rrkit/error',
  rage: 'rrkit/rage',
  deadClick: 'rrkit/deadclick',
  vital: 'rrkit/vital',
} as const;

/** CSS class names recognised by the tracker for masking control. */
export const MASK_CLASSES = {
  /** Force-mask the text of an element. */
  mask: 'rrkit-mask',
  /** Reveal an element that would otherwise be masked. */
  unmask: 'rrkit-unmask',
  /** Block (do not record) an element entirely. */
  block: 'rrkit-block',
} as const;
