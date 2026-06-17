import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  SetupMetadataSchema,
  UpdateCaptureSchema,
  type IntegrationResponse,
  type MetadataFieldsResponse,
  type S3Config,
  type S3TestResult,
} from '@rrkit/shared';
import type { AppContext } from '../context';
import { metadataFieldsRepo } from '../db/metadataFields.repo';
import { settingsRepo } from '../db/settings.repo';
import { S3Service } from '../services/s3.service';
import { validate } from '../util/validate';

const StorageUpdateSchema = z.object({
  endpoint: z.string().trim().default(''),
  region: z.string().trim().min(1),
  bucket: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  /** Empty => keep the existing stored secret. */
  secretAccessKey: z.string().default(''),
  forcePathStyle: z.boolean(),
});

export async function settingsRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await app.register(async (r) => {
    r.addHook('onRequest', r.requireAdmin);

    /* ---- capture (features + privacy + retention) ---- */
    r.get('/settings/capture', async () => ({
      features: settingsRepo.getFeatures(),
      privacy: settingsRepo.getPrivacy(),
      retention: settingsRepo.getRetention(),
    }));

    r.put('/settings/capture', async (req, reply) => {
      const v = validate(UpdateCaptureSchema, req.body);
      if (!v.ok) return reply.code(400).send({ error: v.message });
      settingsRepo.setFeatures(v.data.features);
      settingsRepo.setPrivacy(v.data.privacy);
      settingsRepo.setRetention(v.data.retention);
      return { ok: true };
    });

    /* ---- storage (S3) ---- */
    r.get('/settings/storage', async () => {
      const s3 = settingsRepo.getS3();
      return {
        endpoint: s3?.endpoint ?? '',
        region: s3?.region ?? '',
        bucket: s3?.bucket ?? '',
        accessKeyId: s3?.accessKeyId ?? '',
        forcePathStyle: s3?.forcePathStyle ?? false,
        secretSet: Boolean(s3?.secretAccessKey),
      };
    });

    r.post('/settings/storage/test', async (req, reply): Promise<S3TestResult | void> => {
      const cfg = resolveStorage(req.body, reply);
      if (!cfg) return;
      return S3Service.validate(cfg);
    });

    r.put('/settings/storage', async (req, reply): Promise<S3TestResult | void> => {
      const cfg = resolveStorage(req.body, reply);
      if (!cfg) return;
      const result = await S3Service.validate(cfg);
      if (!result.ok) return reply.code(400).send(result);
      settingsRepo.setS3(cfg);
      ctx.s3.configure(cfg);
      return result;
    });

    /* ---- metadata fields ---- */
    r.get('/settings/metadata', async (): Promise<MetadataFieldsResponse> => ({
      fields: metadataFieldsRepo.list(),
    }));

    r.put('/settings/metadata', async (req, reply) => {
      const v = validate(SetupMetadataSchema, req.body);
      if (!v.ok) return reply.code(400).send({ error: v.message });
      const keys = v.data.fields.map((f) => f.key);
      if (new Set(keys).size !== keys.length) {
        return reply.code(400).send({ error: 'Metadata field keys must be unique.' });
      }
      metadataFieldsRepo.replaceAll(v.data.fields);
      return { ok: true, fields: metadataFieldsRepo.list() };
    });

    /* ---- integration (snippet + key) ---- */
    r.get('/settings/integration', async (req): Promise<IntegrationResponse> => {
      const host = req.headers.host ?? `localhost:${ctx.env.port}`;
      const instanceUrl = `${req.protocol}://${host}`;
      return {
        ingestKey: settingsRepo.getIngest()?.key ?? '',
        instanceUrl,
        scriptUrl: `${instanceUrl}/tracker.js`,
      };
    });
  });
}

function resolveStorage(body: unknown, reply: { code: (n: number) => { send: (b: unknown) => void } }):
  | S3Config
  | null {
  const v = validate(StorageUpdateSchema, body);
  if (!v.ok) {
    reply.code(400).send({ ok: false, detail: v.message });
    return null;
  }
  let secret = v.data.secretAccessKey;
  if (!secret) {
    const existing = settingsRepo.getS3();
    if (!existing?.secretAccessKey) {
      reply.code(400).send({ ok: false, detail: 'Secret access key is required.' });
      return null;
    }
    secret = existing.secretAccessKey;
  }
  return {
    endpoint: v.data.endpoint,
    region: v.data.region,
    bucket: v.data.bucket,
    accessKeyId: v.data.accessKeyId,
    secretAccessKey: secret,
    forcePathStyle: v.data.forcePathStyle,
  };
}
