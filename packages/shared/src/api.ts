import { z } from 'zod';
import { RrwebEventSchema } from './events.js';
import { MetadataBagSchema, MetadataFieldInputSchema } from './sessions.js';
import {
  FeaturesSchema,
  PrivacySchema,
  RetentionSchema,
  S3ConfigSchema,
  type Features,
  type Privacy,
} from './settings.js';
import type { MetadataField, SessionRecord, ChunkInfo } from './sessions.js';

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
export const UpdateCaptureSchema = z.object({
  features: FeaturesSchema,
  privacy: PrivacySchema,
  retention: RetentionSchema,
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
  metadataKeys: string[];
  maxBatchBytes: number;
  uploadIntervalMs: number;
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
