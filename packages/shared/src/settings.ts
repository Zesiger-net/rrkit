import { z } from 'zod';

/** Capture features the host dev can toggle. The tracker honours these at init. */
export const FeaturesSchema = z.object({
  console: z.boolean(),
  network: z.boolean(),
  canvas: z.boolean(),
  errors: z.boolean(),
});
export type Features = z.infer<typeof FeaturesSchema>;
export const DEFAULT_FEATURES: Features = {
  console: true,
  network: true,
  canvas: false,
  errors: true,
};

export const PrivacySchema = z.object({
  /** Mask all input fields by default. */
  maskInputs: z.boolean(),
});
export type Privacy = z.infer<typeof PrivacySchema>;
export const DEFAULT_PRIVACY: Privacy = { maskInputs: true };

export const RetentionSchema = z.object({
  /** Delete sessions older than this many days. */
  days: z.number().int().min(1).max(3650),
});
export type Retention = z.infer<typeof RetentionSchema>;

/** S3 connection config. `endpoint` empty => AWS default endpoint. */
export const S3ConfigSchema = z.object({
  endpoint: z.string().trim().optional().default(''),
  region: z.string().trim().min(1),
  bucket: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),
  forcePathStyle: z.boolean(),
});
export type S3Config = z.infer<typeof S3ConfigSchema>;

/** Persisted setup progress. App is active only when `complete` is true. */
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
