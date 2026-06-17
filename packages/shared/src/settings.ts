import { z } from 'zod';

/* ================================================================== *
 * Feature toggles — the master on/off switches for each capture area.
 * `rage` and `deadClick` are split out from `errors` so they can be
 * controlled independently (dead clicks are opt-in to avoid noise).
 * ================================================================== */
export const FeaturesSchema = z.object({
  console: z.boolean().default(true),
  network: z.boolean().default(true),
  canvas: z.boolean().default(false),
  errors: z.boolean().default(true),
  /** Rapid repeated clicks. Previously bundled into `errors`; defaults on. */
  rage: z.boolean().default(true),
  /** Clicks that produce no DOM change / navigation. Opt-in. */
  deadClick: z.boolean().default(false),
  /** Core Web Vitals (LCP / CLS / FCP / TTFB). Opt-in. */
  webVitals: z.boolean().default(false),
});
export type Features = z.infer<typeof FeaturesSchema>;
export const DEFAULT_FEATURES: Features = FeaturesSchema.parse({});

/* ================================================================== *
 * Privacy & masking — from a single toggle to granular, selector-based
 * control plus an optional regex PII scrubber.
 * ================================================================== */
export const PrivacySchema = z.object({
  /** Mask all input fields by default. */
  maskInputs: z.boolean().default(true),
  /** CSS selector(s) whose text is force-masked (comma-separated). */
  maskTextSelector: z.string().max(2000).default(''),
  /** CSS selector(s) whose elements are blocked (not recorded). */
  blockSelector: z.string().max(2000).default(''),
  /** CSS selector(s) whose interactions are ignored. */
  ignoreSelector: z.string().max(2000).default(''),
  /** Which input types are masked (in addition to the global toggle). */
  maskInputTypes: z.array(z.string().max(40)).max(40).default(['password']),
  /** Run a built-in regex scrub (emails, card numbers) over recorded text. */
  scrubPii: z.boolean().default(false),
  /** Do not store the client IP at all. */
  dropIp: z.boolean().default(false),
  /** Store a truncated IP (drop the last octet / IPv6 suffix). */
  anonymizeIp: z.boolean().default(false),
  /** Honour navigator.doNotTrack / Global Privacy Control. */
  respectDnt: z.boolean().default(false),
  /** Require an explicit rrkit.optIn() before recording starts. */
  requireConsent: z.boolean().default(false),
});
export type Privacy = z.infer<typeof PrivacySchema>;
export const DEFAULT_PRIVACY: Privacy = PrivacySchema.parse({});

/* ================================================================== *
 * Canvas — fps / quality / format (was hardcoded in the recorder).
 * ================================================================== */
export const CanvasFormatSchema = z.enum(['webp', 'jpeg', 'png']);
export type CanvasFormat = z.infer<typeof CanvasFormatSchema>;
export const CanvasSettingsSchema = z.object({
  /** Snapshot rate. Maps to rrweb `sampling.canvas`. */
  fps: z.number().int().min(1).max(30).default(2),
  /** Image quality 0.1–1.0 (webp/jpeg). */
  quality: z.number().min(0.1).max(1).default(0.6),
  format: CanvasFormatSchema.default('webp'),
});
export type CanvasSettings = z.infer<typeof CanvasSettingsSchema>;
export const DEFAULT_CANVAS: CanvasSettings = CanvasSettingsSchema.parse({});

/* ================================================================== *
 * Frustration — rage + dead-click thresholds (was hardcoded).
 * ================================================================== */
export const FrustrationSettingsSchema = z.object({
  rageThreshold: z.number().int().min(2).max(20).default(3),
  rageWindowMs: z.number().int().min(200).max(10000).default(1000),
  rageRadiusPx: z.number().int().min(5).max(400).default(30),
  /** A click with no DOM mutation / navigation within this window is "dead". */
  deadClickWindowMs: z.number().int().min(300).max(10000).default(3000),
});
export type FrustrationSettings = z.infer<typeof FrustrationSettingsSchema>;
export const DEFAULT_FRUSTRATION: FrustrationSettings = FrustrationSettingsSchema.parse({});

/* ================================================================== *
 * Volume / sampling — throttle high-frequency events. Maps to rrweb
 * `sampling`. Numbers are throttle windows in ms (0 = capture all).
 * ================================================================== */
export const VolumeSettingsSchema = z.object({
  mousemoveWaitMs: z.number().int().min(0).max(2000).default(50),
  scrollWaitMs: z.number().int().min(0).max(2000).default(100),
  mediaWaitMs: z.number().int().min(0).max(2000).default(500),
  /** 'all' records every keystroke; 'last' only the final value per field. */
  input: z.enum(['all', 'last']).default('last'),
  mouseInteraction: z.boolean().default(true),
});
export type VolumeSettings = z.infer<typeof VolumeSettingsSchema>;
export const DEFAULT_VOLUME: VolumeSettings = VolumeSettingsSchema.parse({});

/* ================================================================== *
 * DOM fidelity & storage efficiency.
 * ================================================================== */
export const DomSettingsSchema = z.object({
  /** Strip comments/scripts/meta to shrink snapshots. */
  slimDom: z.boolean().default(false),
  inlineStylesheet: z.boolean().default(true),
  /** Inline image data (heavier, but survives expiring URLs). */
  inlineImages: z.boolean().default(false),
  collectFonts: z.boolean().default(true),
  recordCrossOriginIframes: z.boolean().default(false),
  /** Full-snapshot interval (ms) for replay reliability. 0 = disabled. */
  checkoutEveryNms: z.number().int().min(0).max(600000).default(0),
  /** Compress events with rrweb's pack() before upload (player unpacks). */
  pack: z.boolean().default(false),
});
export type DomSettings = z.infer<typeof DomSettingsSchema>;
export const DEFAULT_DOM: DomSettings = DomSettingsSchema.parse({});

/* ================================================================== *
 * Console capture detail.
 * ================================================================== */
export const ConsoleLevelSchema = z.enum(['log', 'info', 'warn', 'error', 'debug']);
export type ConsoleLevel = z.infer<typeof ConsoleLevelSchema>;
export const ConsoleSettingsSchema = z.object({
  levels: z.array(ConsoleLevelSchema).default(['log', 'info', 'warn', 'error', 'debug']),
  /** Truncate each serialized argument to this many characters. */
  maxArgLength: z.number().int().min(100).max(100000).default(2000),
  /** Attach a stack trace to console.error/warn. */
  captureStack: z.boolean().default(false),
});
export type ConsoleSettings = z.infer<typeof ConsoleSettingsSchema>;
export const DEFAULT_CONSOLE: ConsoleSettings = ConsoleSettingsSchema.parse({});

/* ================================================================== *
 * Upload / batching cadence (moved from SDK overrides into the server).
 * ================================================================== */
export const UploadSettingsSchema = z.object({
  uploadIntervalMs: z.number().int().min(500).max(60000).default(5000),
  flushThresholdBytes: z
    .number()
    .int()
    .min(64 * 1024)
    .max(8 * 1024 * 1024)
    .default(1024 * 1024),
});
export type UploadSettings = z.infer<typeof UploadSettingsSchema>;
export const DEFAULT_UPLOAD: UploadSettings = UploadSettingsSchema.parse({});

/* ================================================================== *
 * Network capture — headers/bodies are OFF by default with full controls.
 * ================================================================== */
export const NetworkSettingsSchema = z.object({
  recordHeaders: z.boolean().default(false),
  recordBody: z.boolean().default(false),
  /** Truncate captured bodies beyond this many bytes. */
  maxBodyBytes: z
    .number()
    .int()
    .min(0)
    .max(1024 * 1024)
    .default(10 * 1024),
  /** Only capture bodies for these content-type prefixes. */
  contentTypeAllowlist: z.array(z.string().max(120)).max(40).default(['application/json', 'text/']),
  /** Regex strings; if non-empty, only matching URLs are recorded at all. */
  urlAllowlist: z.array(z.string().max(400)).max(100).default([]),
  /** Regex strings; matching URLs are never recorded. */
  urlBlocklist: z.array(z.string().max(400)).max(100).default([]),
  /** Header names redacted before leaving the browser (lower-cased compare). */
  redactHeaders: z
    .array(z.string().max(80))
    .max(100)
    .default(['authorization', 'cookie', 'set-cookie']),
  /** Body keys (JSON keys / form fields) redacted before leaving the browser. */
  redactBodyKeys: z
    .array(z.string().max(80))
    .max(100)
    .default(['password', 'token', 'secret', 'ssn', 'card', 'authorization']),
});
export type NetworkSettings = z.infer<typeof NetworkSettingsSchema>;
export const DEFAULT_NETWORK: NetworkSettings = NetworkSettingsSchema.parse({});

/* ================================================================== *
 * Sampling & recording rules.
 * ================================================================== */
export const SamplingSettingsSchema = z.object({
  /** Fraction of sessions to record (0–1). 1 = record everyone. */
  sessionSampleRate: z.number().min(0).max(1).default(1),
  /**
   * Buffer events and only persist the session once an error / rage / dead
   * click fires. High-signal sessions only.
   */
  recordOnlyOnError: z.boolean().default(false),
  /** Regex strings; if non-empty, only record on matching URLs. */
  urlAllowlist: z.array(z.string().max(400)).max(100).default([]),
  /** Regex strings; never record on matching URLs (replaces SDK excludeRoutes). */
  urlBlocklist: z.array(z.string().max(400)).max(100).default([]),
  /** Only record sessions whose metadata matches every key=value here. */
  metadataAllow: z.record(z.string(), z.string()).default({}),
});
export type SamplingSettings = z.infer<typeof SamplingSettingsSchema>;
export const DEFAULT_SAMPLING: SamplingSettings = SamplingSettingsSchema.parse({});

/* ================================================================== *
 * Session-keep policy (was hardcoded MIN_SESSION_* constants).
 * ================================================================== */
export const SessionPolicySchema = z.object({
  minDurationMs: z.number().int().min(0).max(600000).default(20000),
  minEventCount: z.number().int().min(0).max(100000).default(30),
});
export type SessionPolicy = z.infer<typeof SessionPolicySchema>;
export const DEFAULT_SESSION_POLICY: SessionPolicy = SessionPolicySchema.parse({});

/* ================================================================== *
 * Retention.
 * ================================================================== */
export const RetentionSchema = z.object({
  /** Delete sessions older than this many days. */
  days: z.number().int().min(1).max(3650),
});
export type Retention = z.infer<typeof RetentionSchema>;

/* ================================================================== *
 * Alerts (Phase 5).
 * ================================================================== */
export const AlertsSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** Outbound webhook (Slack-compatible JSON payload). */
  webhookUrl: z.string().max(2000).default(''),
  /** Notify when an error issue is seen this many times within the window. */
  errorSpikeThreshold: z.number().int().min(1).max(100000).default(50),
  /** Notify on the first occurrence of a brand-new error issue. */
  notifyNewIssues: z.boolean().default(true),
  /** Notify on rage-click clusters. */
  notifyRage: z.boolean().default(false),
});
export type AlertsSettings = z.infer<typeof AlertsSettingsSchema>;
export const DEFAULT_ALERTS: AlertsSettings = AlertsSettingsSchema.parse({});

/* ================================================================== *
 * Security (Phase 6).
 * ================================================================== */
export const SecuritySettingsSchema = z.object({
  /** If non-empty, ingest is only accepted from these origins. */
  allowedOrigins: z.array(z.string().max(400)).max(200).default([]),
  /** Max ingest requests per minute per IP (0 = unlimited). */
  ingestRatePerMin: z.number().int().min(0).max(1000000).default(0),
});
export type SecuritySettings = z.infer<typeof SecuritySettingsSchema>;
export const DEFAULT_SECURITY: SecuritySettings = SecuritySettingsSchema.parse({});

/* ================================================================== *
 * S3 connection config. `endpoint` empty => AWS default endpoint.
 * ================================================================== */
export const S3ConfigSchema = z.object({
  endpoint: z.string().trim().optional().default(''),
  region: z.string().trim().min(1),
  bucket: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),
  forcePathStyle: z.boolean(),
});
export type S3Config = z.infer<typeof S3ConfigSchema>;

/* ================================================================== *
 * Persisted setup progress. App is active only when `complete` is true.
 * ================================================================== */
export interface SetupState {
  complete: boolean;
  passwordSet: boolean;
  s3Verified: boolean;
  metadataSet: boolean;
}
export const INITIAL_SETUP_STATE: SetupState = {
  complete: false,
  passwordSet: false,
  s3Verified: false,
  metadataSet: false,
};
