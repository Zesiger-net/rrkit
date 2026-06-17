import {
  DEFAULT_FEATURES,
  DEFAULT_PRIVACY,
  DEFAULT_RETENTION_DAYS,
  INITIAL_SETUP_STATE,
  type Features,
  type Privacy,
  type Retention,
  type S3Config,
  type SetupState,
} from '@rrkit/shared';
import { getDb } from './connection';

/** Internal auth record (never sent to the browser). */
export interface AuthRecord {
  passwordHash: string | null;
  jwtSecret: string;
}

export interface IngestRecord {
  key: string;
}

type SettingKey = 'setup' | 'features' | 'privacy' | 'retention' | 's3' | 'auth' | 'ingest';

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

export const settingsRepo = {
  getSetup(): SetupState {
    return getRaw<SetupState>('setup') ?? INITIAL_SETUP_STATE;
  },
  setSetup(state: SetupState): void {
    setRaw('setup', state);
  },

  getFeatures(): Features {
    return getRaw<Features>('features') ?? DEFAULT_FEATURES;
  },
  setFeatures(features: Features): void {
    setRaw('features', features);
  },

  getPrivacy(): Privacy {
    return getRaw<Privacy>('privacy') ?? DEFAULT_PRIVACY;
  },
  setPrivacy(privacy: Privacy): void {
    setRaw('privacy', privacy);
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
