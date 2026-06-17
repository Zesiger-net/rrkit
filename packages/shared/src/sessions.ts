import { z } from 'zod';

export const SESSION_STATUSES = ['recording', 'completed', 'failed'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const METADATA_FIELD_TYPES = ['string', 'number', 'boolean', 'email'] as const;
export type MetadataFieldType = (typeof METADATA_FIELD_TYPES)[number];

/** Values the developer may attach to a session via the SDK. */
export const MetadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type MetadataValue = z.infer<typeof MetadataValueSchema>;
export const MetadataBagSchema = z.record(MetadataValueSchema);
export type MetadataBag = z.infer<typeof MetadataBagSchema>;

/** A custom metadata field definition (configured in the dashboard). */
export const MetadataFieldInputSchema = z.object({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]{0,30}$/,
      'Use lowercase letters, numbers and underscores, starting with a letter (max 31 chars).',
    ),
  label: z.string().min(1).max(60),
  type: z.enum(METADATA_FIELD_TYPES),
  filterable: z.boolean(),
});
export type MetadataFieldInput = z.infer<typeof MetadataFieldInputSchema>;

export interface MetadataField extends MetadataFieldInput {
  id: number;
  created: string;
}

/** A stored session (metadata only; events live in S3). */
export interface SessionRecord {
  id: string;
  ip: string | null;
  created: string;
  updated: string;
  ended: string | null;
  status: SessionStatus;
  event_count: number;
  duration_ms: number;
  chunk_count: number;
  ua_browser: string | null;
  ua_os: string | null;
  ua_device: string | null;
  screen_w: number | null;
  screen_h: number | null;
  viewport_w: number | null;
  viewport_h: number | null;
  url: string | null;
  metadata: MetadataBag | null;
  problem: string | null;
  /** Admin-set: starred/bookmarked for triage. */
  starred: boolean;
  /** Admin-set free-text note. */
  note: string | null;
}

/** A grouped error issue (many sessions, one fingerprint). */
export interface IssueRecord {
  fingerprint: string;
  message: string;
  count: number;
  sessions: number;
  firstSeen: string;
  lastSeen: string;
}

/** Cross-session frustration totals for the dashboard. */
export interface FrustrationSummary {
  errors: number;
  errorIssues: number;
  rage: number;
  deadclick: number;
}

/** Descriptor for one stored event chunk in S3. */
export interface ChunkInfo {
  key: string;
  seq: number;
  count: number;
  firstTs: number;
  lastTs: number;
  bytes: number;
}
