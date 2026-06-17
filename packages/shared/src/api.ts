import { z } from 'zod';
import { RrwebEventSchema } from './events.js';
import { MetadataBagSchema, MetadataFieldInputSchema } from './sessions.js';
import {
  FeaturesSchema,
  PrivacySchema,
  RetentionSchema,
  S3ConfigSchema,
  CanvasSettingsSchema,
  FrustrationSettingsSchema,
  VolumeSettingsSchema,
  DomSettingsSchema,
  ConsoleSettingsSchema,
  UploadSettingsSchema,
  NetworkSettingsSchema,
  SamplingSettingsSchema,
  SessionPolicySchema,
  AlertsSettingsSchema,
  SecuritySettingsSchema,
  type Features,
  type Privacy,
  type CanvasSettings,
  type FrustrationSettings,
  type VolumeSettings,
  type DomSettings,
  type ConsoleSettings,
  type UploadSettings,
  type NetworkSettings,
  type SamplingSettings,
} from './settings.js';
import type {
  MetadataField,
  SessionRecord,
  ChunkInfo,
  IssueRecord,
  FrustrationSummary,
} from './sessions.js';

/* ------------------------------------------------------------------ *
 * Setup + auth request bodies (validated server-side)
 * ------------------------------------------------------------------ */

export const SetupPasswordSchema = z.object({
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});

export const SetupS3Schema = S3ConfigSchema;

export const SetupMetadataSchema = z.object({
  fields: z.array(MetadataFieldInputSchema).max(50),
});

export const LoginSchema = z.object({
  password: z.string().min(1),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(200),
});

/* ------------------------------------------------------------------ *
 * Settings update bodies
 * ------------------------------------------------------------------ */

export const UpdateFeaturesSchema = FeaturesSchema;
export const UpdatePrivacySchema = PrivacySchema;
export const UpdateRetentionSchema = RetentionSchema;

/**
 * Capture-settings update. Every group is optional so the dashboard can save
 * one section at a time; the route persists only the groups it receives.
 */
export const UpdateCaptureSchema = z.object({
  features: FeaturesSchema.optional(),
  privacy: PrivacySchema.optional(),
  retention: RetentionSchema.optional(),
  canvas: CanvasSettingsSchema.optional(),
  frustration: FrustrationSettingsSchema.optional(),
  volume: VolumeSettingsSchema.optional(),
  dom: DomSettingsSchema.optional(),
  console: ConsoleSettingsSchema.optional(),
  upload: UploadSettingsSchema.optional(),
  network: NetworkSettingsSchema.optional(),
  sampling: SamplingSettingsSchema.optional(),
  sessionPolicy: SessionPolicySchema.optional(),
  alerts: AlertsSettingsSchema.optional(),
  security: SecuritySettingsSchema.optional(),
});

/* ------------------------------------------------------------------ *
 * Ingestion request bodies
 * ------------------------------------------------------------------ */

const DimSchema = z.object({ w: z.number().int().nonnegative(), h: z.number().int().nonnegative() });

export const IngestStartSchema = z.object({
  key: z.string().optional(),
  screen: DimSchema.optional(),
  viewport: DimSchema.optional(),
  url: z.string().max(2048).optional(),
  metadata: MetadataBagSchema.optional(),
});

export const IngestEventsSchema = z.object({
  key: z.string().optional(),
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  events: z.array(RrwebEventSchema).min(1),
  metadataDelta: MetadataBagSchema.optional(),
});

export const IngestEndSchema = z.object({
  key: z.string().optional(),
  sessionId: z.string(),
});

/* ------------------------------------------------------------------ *
 * Session admin actions
 * ------------------------------------------------------------------ */

/** Right-to-erasure: delete every session whose metadata key=value matches. */
export const EraseByMetadataSchema = z.object({
  key: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(400),
});

/** Patch a session's triage fields. */
export const UpdateSessionSchema = z.object({
  starred: z.boolean().optional(),
  note: z.string().max(5000).optional(),
});

/* ------------------------------------------------------------------ *
 * Response shapes (typed for the dashboard + tracker)
 * ------------------------------------------------------------------ */

export interface StatusResponse {
  setupComplete: boolean;
  authed: boolean;
  version: string;
}

export interface SetupStatusResponse {
  complete: boolean;
  passwordSet: boolean;
  s3Verified: boolean;
  metadataSet: boolean;
}

export interface S3TestResult {
  ok: boolean;
  detail: string;
}

/** Config the tracker fetches at init (`GET /api/config?key=...`). */
export interface TrackerConfigResponse {
  features: Features;
  privacy: Privacy;
  canvas: CanvasSettings;
  frustration: FrustrationSettings;
  volume: VolumeSettings;
  dom: DomSettings;
  console: ConsoleSettings;
  upload: UploadSettings;
  network: NetworkSettings;
  sampling: SamplingSettings;
  metadataKeys: string[];
  maxBatchBytes: number;
  /** @deprecated use `upload.uploadIntervalMs` — kept for older trackers. */
  uploadIntervalMs: number;
  /** @deprecated use `upload.flushThresholdBytes` — kept for older trackers. */
  flushThresholdBytes: number;
}

export interface IngestStartResponse {
  sessionId: string;
}

export interface SessionListResponse {
  items: SessionRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionStatsResponse {
  total: number;
  recording: number;
  completed: number;
  failed: number;
}

export interface SessionFacetsResponse {
  browser: string[];
  os: string[];
  device: string[];
}

export interface SessionManifestResponse {
  session: SessionRecord;
  chunks: ChunkInfo[];
}

export interface IntegrationResponse {
  ingestKey: string;
  instanceUrl: string;
  scriptUrl: string;
}

export interface MetadataFieldsResponse {
  fields: MetadataField[];
}

export interface IssuesResponse {
  items: IssueRecord[];
}

export type FrustrationResponse = FrustrationSummary;

export interface EraseResponse {
  deleted: number;
}

/** Bucket lifecycle status surfaced in the Storage settings tab. */
export interface LifecycleStatusResponse {
  supported: boolean;
  days: number | null;
  error?: string;
}
