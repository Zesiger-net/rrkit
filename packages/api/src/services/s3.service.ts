import { randomUUID } from 'node:crypto';
import {
  DeleteObjectsCommand,
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
  type LifecycleRule,
} from '@aws-sdk/client-s3';
import type { S3Config, S3TestResult } from '@rrkit/shared';

/** rrweb-owned lifecycle rule id, so we never clobber the user's own rules. */
const RETENTION_RULE_ID = 'rrkit-retention';

export interface LifecycleStatus {
  /** Whether the bucket/provider lets rrkit read & write a lifecycle rule. */
  supported: boolean;
  /** Expiry days currently set by rrkit's rule, or null if absent. */
  days: number | null;
  /** Populated when supported === false. */
  error?: string;
}

/* ---- S3 key builders ---- */
export const s3keys = {
  prefix: (id: string) => `${id}/`,
  metadata: (id: string) => `${id}/metadata.json`,
  chunk: (id: string, ts: number, seq: number) => `${id}/events/chunk-${ts}-${seq}.json`,
  canvas: (id: string, ts: number) => `${id}/canvas/${ts}.jpg`,
};

export interface S3Object {
  key: string;
  size: number;
}

/** The UI stores endpoints without a protocol; the SDK needs a full URL. */
function normalizeEndpoint(endpoint: string): string | undefined {
  const trimmed = endpoint.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function buildClient(cfg: S3Config): S3Client {
  return new S3Client({
    region: cfg.region || 'us-east-1',
    endpoint: normalizeEndpoint(cfg.endpoint),
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

export class S3Service {
  private client: S3Client | null = null;
  private bucket = '';

  configure(cfg: S3Config): void {
    this.client = buildClient(cfg);
    this.bucket = cfg.bucket;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private require(): { client: S3Client; bucket: string } {
    if (!this.client) throw new Error('S3 is not configured.');
    return { client: this.client, bucket: this.bucket };
  }

  async putJson(key: string, value: unknown): Promise<void> {
    const { client, bucket } = this.require();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(value),
        ContentType: 'application/json',
      }),
    );
  }

  async putBytes(key: string, body: Buffer, contentType: string): Promise<void> {
    const { client, bucket } = this.require();
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getString(key: string): Promise<string> {
    const { client, bucket } = this.require();
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return res.Body!.transformToString();
  }

  async getBytes(key: string): Promise<Buffer> {
    const { client, bucket } = this.require();
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const arr = await res.Body!.transformToByteArray();
    return Buffer.from(arr);
  }

  async list(prefix: string): Promise<S3Object[]> {
    const { client, bucket } = this.require();
    const out: S3Object[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) out.push({ key: obj.Key, size: obj.Size ?? 0 });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async deletePrefix(prefix: string): Promise<void> {
    const { client, bucket } = this.require();
    const objects = await this.list(prefix);
    for (let i = 0; i < objects.length; i += 1000) {
      const batch = objects.slice(i, i + 1000);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((o) => ({ Key: o.key })) },
        }),
      );
    }
  }

  /* ---- bucket lifecycle (retention) ---- */

  private async readLifecycleRules(): Promise<LifecycleRule[]> {
    const { client, bucket } = this.require();
    try {
      const res = await client.send(
        new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
      );
      return res.Rules ?? [];
    } catch (err) {
      // No lifecycle config yet is not an error — return an empty rule set.
      const code = (err as { name?: string; Code?: string }).name ?? (err as { Code?: string }).Code;
      if (code === 'NoSuchLifecycleConfiguration') return [];
      throw err;
    }
  }

  /**
   * Add/update an rrkit-owned whole-bucket expiry rule of `days`, preserving
   * any other lifecycle rules the user has configured. Best-effort: throws if
   * the bucket/credentials don't allow lifecycle management.
   */
  async syncRetentionLifecycle(days: number): Promise<void> {
    if (!this.isConfigured()) return;
    const { client, bucket } = this.require();
    const existing = (await this.readLifecycleRules()).filter((r) => r.ID !== RETENTION_RULE_ID);
    const rule: LifecycleRule = {
      ID: RETENTION_RULE_ID,
      Status: 'Enabled',
      Filter: { Prefix: '' },
      Expiration: { Days: days },
    };
    await client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: { Rules: [...existing, rule] },
      }),
    );
  }

  /** Report whether rrkit's retention rule is present (for the dashboard). */
  async getLifecycleStatus(): Promise<LifecycleStatus> {
    if (!this.isConfigured()) return { supported: false, days: null, error: 'S3 is not configured.' };
    try {
      const rules = await this.readLifecycleRules();
      const ours = rules.find((r) => r.ID === RETENTION_RULE_ID);
      return { supported: true, days: ours?.Expiration?.Days ?? null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { supported: false, days: null, error: message };
    }
  }

  /** Verify credentials by round-tripping a probe object (write + read + delete). */
  static async validate(cfg: S3Config): Promise<S3TestResult> {
    let client: S3Client | null = null;
    try {
      client = buildClient(cfg);
      await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));

      const probeKey = `__rrkit_healthcheck/${randomUUID()}.txt`;
      const probeBody = `rrkit ${Date.now()}`;
      await client.send(
        new PutObjectCommand({ Bucket: cfg.bucket, Key: probeKey, Body: probeBody }),
      );
      const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: probeKey }));
      const readBack = await res.Body!.transformToString();
      await client.send(new DeleteObjectsCommand({
        Bucket: cfg.bucket,
        Delete: { Objects: [{ Key: probeKey }] },
      }));

      if (readBack !== probeBody) {
        return { ok: false, detail: 'Wrote a probe object but read back different content.' };
      }
      return { ok: true, detail: 'Connected. Write, read and delete all succeeded.' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: message };
    } finally {
      client?.destroy();
    }
  }
}
