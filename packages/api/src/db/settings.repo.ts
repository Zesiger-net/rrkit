import {
  DEFAULT_RETENTION_DAYS,
  INITIAL_SETUP_STATE,
  FeaturesSchema,
  PrivacySchema,
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
  type Retention,
  type S3Config,
  type SetupState,
  type CanvasSettings,
  type FrustrationSettings,
  type VolumeSettings,
  type DomSettings,
  type ConsoleSettings,
  type UploadSettings,
  type NetworkSettings,
  type SamplingSettings,
  type SessionPolicy,
  type AlertsSettings,
  type SecuritySettings,
} from '@rrkit/shared';
import type { z } from 'zod';
import { getDb } from './connection';

/** Internal auth record (never sent to the browser). */
export interface AuthRecord {
  passwordHash: string | null;
  jwtSecret: string;
}

export interface IngestRecord {
  key: string;
}

type SettingKey =
  | 'setup'
  | 'features'
  | 'privacy'
  | 'retention'
  | 's3'
  | 'auth'
  | 'ingest'
  | 'canvas'
  | 'frustration'
  | 'volume'
  | 'dom'
  | 'console'
  | 'upload'
  | 'network'
  | 'sampling'
  | 'sessionPolicy'
  | 'alerts'
  | 'security';

function getRaw<T>(key: SettingKey): T | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

function setRaw(key: SettingKey, value: unknown): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, JSON.stringify(value));
}

/**
 * Read a settings group, parsing stored JSON through its zod schema so any
 * fields added since the row was written fall back to their defaults. A
 * corrupt/absent row yields a fully-defaulted object.
 */
function getGroup<S extends z.ZodTypeAny>(key: SettingKey, schema: S): z.infer<S> {
  const raw = getRaw<unknown>(key);
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : schema.parse({});
}

export const settingsRepo = {
  getSetup(): SetupState {
    return getRaw<SetupState>('setup') ?? INITIAL_SETUP_STATE;
  },
  setSetup(state: SetupState): void {
    setRaw('setup', state);
  },

  getFeatures(): Features {
    return getGroup('features', FeaturesSchema);
  },
  setFeatures(features: Features): void {
    setRaw('features', FeaturesSchema.parse(features));
  },

  getPrivacy(): Privacy {
    return getGroup('privacy', PrivacySchema);
  },
  setPrivacy(privacy: Privacy): void {
    setRaw('privacy', PrivacySchema.parse(privacy));
  },

  getCanvas(): CanvasSettings {
    return getGroup('canvas', CanvasSettingsSchema);
  },
  setCanvas(v: CanvasSettings): void {
    setRaw('canvas', CanvasSettingsSchema.parse(v));
  },

  getFrustration(): FrustrationSettings {
    return getGroup('frustration', FrustrationSettingsSchema);
  },
  setFrustration(v: FrustrationSettings): void {
    setRaw('frustration', FrustrationSettingsSchema.parse(v));
  },

  getVolume(): VolumeSettings {
    return getGroup('volume', VolumeSettingsSchema);
  },
  setVolume(v: VolumeSettings): void {
    setRaw('volume', VolumeSettingsSchema.parse(v));
  },

  getDom(): DomSettings {
    return getGroup('dom', DomSettingsSchema);
  },
  setDom(v: DomSettings): void {
    setRaw('dom', DomSettingsSchema.parse(v));
  },

  getConsole(): ConsoleSettings {
    return getGroup('console', ConsoleSettingsSchema);
  },
  setConsole(v: ConsoleSettings): void {
    setRaw('console', ConsoleSettingsSchema.parse(v));
  },

  getUpload(): UploadSettings {
    return getGroup('upload', UploadSettingsSchema);
  },
  setUpload(v: UploadSettings): void {
    setRaw('upload', UploadSettingsSchema.parse(v));
  },

  getNetwork(): NetworkSettings {
    return getGroup('network', NetworkSettingsSchema);
  },
  setNetwork(v: NetworkSettings): void {
    setRaw('network', NetworkSettingsSchema.parse(v));
  },

  getSampling(): SamplingSettings {
    return getGroup('sampling', SamplingSettingsSchema);
  },
  setSampling(v: SamplingSettings): void {
    setRaw('sampling', SamplingSettingsSchema.parse(v));
  },

  getSessionPolicy(): SessionPolicy {
    return getGroup('sessionPolicy', SessionPolicySchema);
  },
  setSessionPolicy(v: SessionPolicy): void {
    setRaw('sessionPolicy', SessionPolicySchema.parse(v));
  },

  getAlerts(): AlertsSettings {
    return getGroup('alerts', AlertsSettingsSchema);
  },
  setAlerts(v: AlertsSettings): void {
    setRaw('alerts', AlertsSettingsSchema.parse(v));
  },

  getSecurity(): SecuritySettings {
    return getGroup('security', SecuritySettingsSchema);
  },
  setSecurity(v: SecuritySettings): void {
    setRaw('security', SecuritySettingsSchema.parse(v));
  },

  getRetention(): Retention {
    return getRaw<Retention>('retention') ?? { days: DEFAULT_RETENTION_DAYS };
  },
  setRetention(retention: Retention): void {
    setRaw('retention', retention);
  },

  getS3(): S3Config | null {
    return getRaw<S3Config>('s3');
  },
  setS3(config: S3Config): void {
    setRaw('s3', config);
  },

  getAuth(): AuthRecord | null {
    return getRaw<AuthRecord>('auth');
  },
  setAuth(auth: AuthRecord): void {
    setRaw('auth', auth);
  },

  getIngest(): IngestRecord | null {
    return getRaw<IngestRecord>('ingest');
  },
  setIngest(ingest: IngestRecord): void {
    setRaw('ingest', ingest);
  },
};
