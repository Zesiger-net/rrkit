import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  IngestEndSchema,
  IngestEventsSchema,
  IngestStartSchema,
  type IngestStartResponse,
  type MetadataBag,
} from '@rrkit/shared';
import type { AppContext } from '../context';
import { metadataFieldsRepo } from '../db/metadataFields.repo';
import { sessionsRepo } from '../db/sessions.repo';
import { s3keys } from '../services/s3.service';
import { finalizeSession } from '../services/sessionService';
import { generateSessionId } from '../util/ids';
import { parseUA } from '../util/ua';
import { validate } from '../util/validate';

/** Reserved metadata key set by SDK `identify()`, always accepted. */
const RESERVED_KEYS = new Set(['user_id']);

function allowedMetadata(bag: MetadataBag | undefined): MetadataBag | null {
  if (!bag) return null;
  const allowed = new Set([...metadataFieldsRepo.keys(), ...RESERVED_KEYS]);
  const out: MetadataBag = {};
  for (const [k, v] of Object.entries(bag)) {
    if (allowed.has(k)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export async function ingestRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post('/ingest/start', { preHandler: app.requireIngestKey }, async (req, reply) => {
    const v = validate(IngestStartSchema, req.body);
    if (!v.ok) return reply.code(400).send({ error: v.message });

    const ua = parseUA(req.headers['user-agent']);
    const metadata = allowedMetadata(v.data.metadata);
    const id = generateSessionId();

    sessionsRepo.create({
      id,
      ingestKey: req.ingestKey ?? null,
      ip: clientIp(req),
      uaBrowser: ua.browser,
      uaOs: ua.os,
      uaDevice: ua.device,
      screenW: v.data.screen?.w ?? null,
      screenH: v.data.screen?.h ?? null,
      viewportW: v.data.viewport?.w ?? null,
      viewportH: v.data.viewport?.h ?? null,
      url: v.data.url ?? null,
      metadata,
    });

    if (ctx.s3.isConfigured()) {
      try {
        await ctx.s3.putJson(s3keys.metadata(id), {
          id,
          created: new Date().toISOString(),
          ua,
          screen: v.data.screen ?? null,
          viewport: v.data.viewport ?? null,
          url: v.data.url ?? null,
          metadata,
        });
      } catch (err) {
        req.log.warn({ err, id }, 'failed to write session metadata to S3');
      }
    }

    return { sessionId: id } satisfies IngestStartResponse;
  });

  app.post('/ingest/events', { preHandler: app.requireIngestKey }, async (req, reply) => {
    const v = validate(IngestEventsSchema, req.body);
    if (!v.ok) return reply.code(400).send({ error: v.message });

    const session = sessionsRepo.get(v.data.sessionId);
    if (!session) return reply.code(404).send({ error: 'Unknown session' });
    if (session.status !== 'recording') {
      return reply.code(409).send({ error: 'Session already ended' });
    }

    const ts = Date.now();
    const key = s3keys.chunk(v.data.sessionId, ts, v.data.seq);
    try {
      await ctx.s3.putJson(key, v.data.events);
    } catch (err) {
      req.log.error({ err, key }, 'failed to store event chunk');
      return reply.code(502).send({ error: 'Storage error' });
    }

    sessionsRepo.recordChunk(v.data.sessionId, v.data.events.length);
    const delta = allowedMetadata(v.data.metadataDelta);
    if (delta) sessionsRepo.mergeMetadata(v.data.sessionId, delta);

    return { ok: true };
  });

  app.post('/ingest/end', { preHandler: app.requireIngestKey }, async (req, reply) => {
    const v = validate(IngestEndSchema, req.body);
    if (!v.ok) return reply.code(400).send({ error: v.message });
    await finalizeSession(ctx.s3, v.data.sessionId);
    return { ok: true };
  });
}

function clientIp(req: FastifyRequest): string | null {
  return req.ip || null;
}
