import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  SetupMetadataSchema,
  SetupPasswordSchema,
  SetupS3Schema,
  type SetupStatusResponse,
  type S3TestResult,
} from '@rrkit/shared';
import type { AppContext } from '../context';
import { metadataFieldsRepo } from '../db/metadataFields.repo';
import { settingsRepo } from '../db/settings.repo';
import { S3Service } from '../services/s3.service';
import { generateIngestKey } from '../util/ids';
import { hashPassword } from '../util/password';
import { validate } from '../util/validate';

/** Block setup mutations once setup is complete. */
function ensureNotComplete(reply: FastifyReply): boolean {
  if (settingsRepo.getSetup().complete) {
    reply.code(409).send({ error: 'Setup is already complete.' });
    return false;
  }
  return true;
}

export async function setupRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/setup/status', async (): Promise<SetupStatusResponse> => {
    const s = settingsRepo.getSetup();
    return {
      complete: s.complete,
      passwordSet: s.passwordSet,
      s3Verified: s.s3Verified,
      metadataSet: s.metadataSet,
    };
  });

  app.post('/setup/password', async (req, reply) => {
    if (!ensureNotComplete(reply)) return;
    const v = validate(SetupPasswordSchema, req.body);
    if (!v.ok) return reply.code(400).send({ error: v.message });

    const auth = settingsRepo.getAuth();
    settingsRepo.setAuth({
      passwordHash: hashPassword(v.data.password),
      jwtSecret: auth?.jwtSecret ?? '',
    });
    settingsRepo.setSetup({ ...settingsRepo.getSetup(), passwordSet: true });
    return { ok: true };
  });

  app.post('/setup/s3', async (req, reply): Promise<S3TestResult | void> => {
    if (!ensureNotComplete(reply)) return;
    const v = validate(SetupS3Schema, req.body);
    if (!v.ok) return reply.code(400).send({ ok: false, detail: v.message });

    const result = await S3Service.validate(v.data);
    if (!result.ok) return reply.code(400).send(result);

    settingsRepo.setS3(v.data);
    ctx.s3.configure(v.data);
    settingsRepo.setSetup({ ...settingsRepo.getSetup(), s3Verified: true });
    return result;
  });

  app.post('/setup/metadata', async (req, reply) => {
    if (!ensureNotComplete(reply)) return;
    const v = validate(SetupMetadataSchema, req.body);
    if (!v.ok) return reply.code(400).send({ error: v.message });

    if (hasDuplicateKeys(v.data.fields.map((f) => f.key))) {
      return reply.code(400).send({ error: 'Metadata field keys must be unique.' });
    }
    metadataFieldsRepo.replaceAll(v.data.fields);
    settingsRepo.setSetup({ ...settingsRepo.getSetup(), metadataSet: true });
    return { ok: true, fields: metadataFieldsRepo.list() };
  });

  app.post('/setup/complete', async (_req, reply) => {
    if (!ensureNotComplete(reply)) return;
    const s = settingsRepo.getSetup();
    if (!s.passwordSet) return reply.code(400).send({ error: 'Set an admin password first.' });
    if (!s.s3Verified) return reply.code(400).send({ error: 'Verify your S3 connection first.' });

    if (!settingsRepo.getIngest()) {
      settingsRepo.setIngest({ key: generateIngestKey() });
    }
    settingsRepo.setSetup({ ...s, metadataSet: true, complete: true });
    return { ok: true };
  });
}

function hasDuplicateKeys(keys: string[]): boolean {
  return new Set(keys).size !== keys.length;
}
