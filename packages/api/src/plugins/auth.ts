import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { COOKIE_NAME, INGEST_KEY_HEADER } from '@rrkit/shared';
import { settingsRepo } from '../db/settings.repo';

/** Register JWT (cookie-based) and the admin/ingest auth pre-handlers on the root instance. */
export async function registerAuth(app: FastifyInstance, jwtSecret: string): Promise<void> {
  await app.register(fastifyJwt, {
    secret: jwtSecret,
    cookie: { cookieName: COOKIE_NAME, signed: false },
  });

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
  });

  app.decorate('requireIngestKey', async (req: FastifyRequest, reply: FastifyReply) => {
    const presented = extractIngestKey(req);
    const expected = settingsRepo.getIngest()?.key;
    if (!expected || !presented || presented !== expected) {
      return reply.code(401).send({ error: 'Invalid ingest key' });
    }
    req.ingestKey = presented;
  });
}

/** Ingest key may arrive via header, query (?key=), or JSON body (for sendBeacon). */
export function extractIngestKey(req: FastifyRequest): string | undefined {
  const header = req.headers[INGEST_KEY_HEADER];
  if (typeof header === 'string' && header) return header;

  const query = (req.query as Record<string, unknown> | undefined)?.key;
  if (typeof query === 'string' && query) return query;

  const body = (req.body as Record<string, unknown> | undefined)?.key;
  if (typeof body === 'string' && body) return body;

  return undefined;
}
