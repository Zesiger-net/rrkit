/**
 * Integration-test harness: boots a real Fastify app against an in-memory
 * SQLite database and an in-memory fake S3, so routes can be exercised
 * end-to-end with `app.inject(...)`. Not shipped (excluded from the build).
 */
import { COOKIE_NAME, INGEST_KEY_HEADER, type S3Config } from '@rrkit/shared';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import { getDb, initDb } from '../db/connection';
import { reconcileMetadataColumns, runMigrations } from '../db/migrate';
import { settingsRepo } from '../db/settings.repo';
import { buildApp } from '../server';
import { S3Service, type LifecycleStatus, type S3Object } from '../services/s3.service';
import { hashPassword } from '../util/password';
import { generateIngestKey, generateSecret } from '../util/ids';

/** In-memory S3 replacement that records every object written. */
export class FakeS3 extends S3Service {
  store = new Map<string, Buffer>();
  configured = false;
  lifecycleDays: number | null = null;
  /** When false, lifecycle read/write throws (simulates a provider w/o perms). */
  lifecycleSupported = true;
  /** When true, putJson/putBytes throw (simulates a storage outage). */
  failWrites = false;
  /** When true, list/getString/getBytes throw (simulates a read outage). */
  failReads = false;

  override configure(_cfg: S3Config): void {
    this.configured = true;
  }
  override isConfigured(): boolean {
    return this.configured;
  }

  override async putJson(key: string, value: unknown): Promise<void> {
    if (this.failWrites) throw new Error('simulated S3 write failure');
    this.store.set(key, Buffer.from(JSON.stringify(value)));
  }
  override async putBytes(key: string, body: Buffer): Promise<void> {
    if (this.failWrites) throw new Error('simulated S3 write failure');
    this.store.set(key, Buffer.from(body));
  }
  override async getString(key: string): Promise<string> {
    if (this.failReads) throw new Error('simulated S3 read failure');
    const v = this.store.get(key);
    if (v === undefined) throw new Error(`NoSuchKey: ${key}`);
    return v.toString('utf8');
  }
  override async getBytes(key: string): Promise<Buffer> {
    if (this.failReads) throw new Error('simulated S3 read failure');
    const v = this.store.get(key);
    if (v === undefined) throw new Error(`NoSuchKey: ${key}`);
    return v;
  }
  override async list(prefix: string): Promise<S3Object[]> {
    if (this.failReads) throw new Error('simulated S3 read failure');
    const out: S3Object[] = [];
    for (const [key, val] of this.store) {
      if (key.startsWith(prefix)) out.push({ key, size: val.length });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }
  override async deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
  override async syncRetentionLifecycle(days: number): Promise<void> {
    if (!this.configured) return;
    if (!this.lifecycleSupported) throw new Error('lifecycle configuration not permitted');
    this.lifecycleDays = days;
  }
  override async getLifecycleStatus(): Promise<LifecycleStatus> {
    if (!this.configured) return { supported: false, days: null, error: 'S3 is not configured.' };
    if (!this.lifecycleSupported)
      return { supported: false, days: null, error: 'lifecycle configuration not permitted' };
    return { supported: true, days: this.lifecycleDays };
  }
}

export const VALID_S3_CONFIG: S3Config = {
  endpoint: '',
  region: 'us-east-1',
  bucket: 'rrkit-test',
  accessKeyId: 'AKIA_TEST',
  secretAccessKey: 'secret-test',
  forcePathStyle: false,
};

export interface TestApp {
  app: FastifyInstance;
  s3: FakeS3;
  env: Env;
  jwtSecret: string;
}

/** Patch the static S3 validator so setup/storage routes don't hit the network. */
let s3ValidateResult: { ok: boolean; detail: string } = { ok: true, detail: 'fake ok' };
export function setS3ValidateResult(result: { ok: boolean; detail: string }): void {
  s3ValidateResult = result;
}
(S3Service as { validate: (cfg: S3Config) => Promise<{ ok: boolean; detail: string }> }).validate =
  async () => s3ValidateResult;

function testEnv(): Env {
  return {
    port: 3000,
    host: '127.0.0.1',
    dbPath: ':memory:',
    staticDir: null,
    trackerPath: null,
  };
}

/**
 * Build a fresh app. The SQLite connection is a process-wide singleton, so the
 * first call opens `:memory:` and later calls reuse it after clearing all rows.
 */
export async function createTestApp(): Promise<TestApp> {
  const fresh = !dbReady();
  const db = initDb(':memory:');
  if (fresh) {
    runMigrations(db);
    reconcileMetadataColumns(db);
  } else {
    clearAllTables();
  }
  const jwtSecret = generateSecret();
  settingsRepo.setAuth({ passwordHash: null, jwtSecret });
  const s3 = new FakeS3();
  const app = await buildApp({ env: testEnv(), s3, jwtSecret });
  await app.ready();
  return { app, s3, env: testEnv(), jwtSecret };
}

function dbReady(): boolean {
  try {
    getDb();
    return true;
  } catch {
    return false;
  }
}

function clearAllTables(): void {
  const db = getDb();
  db.exec(
    'DELETE FROM sessions; DELETE FROM session_signals; DELETE FROM alert_state; ' +
      'DELETE FROM metadata_fields; DELETE FROM settings;',
  );
}

/** Mark setup complete by seeding auth, S3, ingest key and setup state directly. */
export function seedCompleteSetup(
  t: TestApp,
  opts: { password?: string; ingestKey?: string } = {},
): { password: string; ingestKey: string } {
  const password = opts.password ?? 'admin-password-123';
  const ingestKey = opts.ingestKey ?? generateIngestKey();
  settingsRepo.setAuth({ passwordHash: hashPassword(password), jwtSecret: t.jwtSecret });
  settingsRepo.setS3(VALID_S3_CONFIG);
  t.s3.configure(VALID_S3_CONFIG);
  settingsRepo.setIngest({ key: ingestKey });
  settingsRepo.setSetup({ complete: true, passwordSet: true, s3Verified: true, metadataSet: true });
  return { password, ingestKey };
}

/** Log in and return the admin cookie value for subsequent requests. */
export async function loginCookie(app: FastifyInstance, password: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`login failed (${res.statusCode}): ${res.body}`);
  }
  const cookie = res.cookies.find((c) => c.name === COOKIE_NAME);
  if (!cookie) throw new Error('no auth cookie set on login');
  return cookie.value;
}

export function adminHeaders(cookie: string): Record<string, string> {
  return { cookie: `${COOKIE_NAME}=${cookie}` };
}

export function ingestHeaders(key: string): Record<string, string> {
  return { [INGEST_KEY_HEADER]: key };
}
