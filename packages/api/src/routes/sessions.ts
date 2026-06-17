import type { FastifyInstance } from 'fastify';
import {
  EraseByMetadataSchema,
  UpdateSessionSchema,
  type ChunkInfo,
  type EraseResponse,
  type FrustrationResponse,
  type IssuesResponse,
  type RrwebEvent,
  type SessionFacetsResponse,
  type SessionListResponse,
  type SessionManifestResponse,
  type SessionStatsResponse,
  type SessionStatus,
} from '@rrkit/shared';
import type { AppContext } from '../context';
import { sessionsRepo, type SessionListFilters } from '../db/sessions.repo';
import { signalsRepo } from '../db/signals.repo';
import { discardSession } from '../services/sessionService';
import { s3keys } from '../services/s3.service';
import { validate } from '../util/validate';

function parseChunkKey(key: string): { ts: number; seq: number } {
  const m = /chunk-(\d+)-(\d+)\.json$/.exec(key);
  return { ts: m ? Number(m[1]) : 0, seq: m ? Number(m[2]) : 0 };
}

function num(v: unknown): number | undefined {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function parseFilters(query: Record<string, unknown>): SessionListFilters {
  const mf: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('mf_') && typeof v === 'string' && v !== '') {
      mf[k.slice(3)] = v;
    }
  }
  const statusRaw = str(query.status);
  const status =
    statusRaw && ['recording', 'completed', 'failed'].includes(statusRaw)
      ? (statusRaw as SessionStatus)
      : undefined;

  return {
    page: num(query.page) ?? 1,
    pageSize: num(query.pageSize) ?? 25,
    status,
    browser: str(query.browser),
    os: str(query.os),
    device: str(query.device),
    minDuration: num(query.minDuration),
    minEvents: num(query.minEvents),
    from: str(query.from),
    to: str(query.to),
    search: str(query.search),
    mf: Object.keys(mf).length ? mf : undefined,
    sort: (str(query.sort) as SessionListFilters['sort']) ?? 'created',
    order: query.order === 'asc' ? 'asc' : 'desc',
  };
}

export async function sessionRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // Encapsulated scope: every route here requires a valid admin cookie.
  await app.register(async (r) => {
    r.addHook('onRequest', r.requireAdmin);

    r.get('/sessions', async (req): Promise<SessionListResponse> => {
      const filters = parseFilters((req.query ?? {}) as Record<string, unknown>);
      const { items, total } = sessionsRepo.list(filters);
      return { items, total, page: filters.page, pageSize: Math.min(filters.pageSize, 100) };
    });

    r.get('/sessions/stats', async (): Promise<SessionStatsResponse> => sessionsRepo.stats());

    r.get('/sessions/facets', async (): Promise<SessionFacetsResponse> => sessionsRepo.facets());

    /* ---- errors & frustration (cross-session) ---- */
    r.get('/sessions/issues', async (): Promise<IssuesResponse> => ({
      items: signalsRepo.listIssues(100),
    }));

    r.get(
      '/sessions/frustration',
      async (): Promise<FrustrationResponse> => signalsRepo.frustration(),
    );

    /* ---- right-to-erasure: delete all sessions for a metadata value ---- */
    r.post('/sessions/erase', async (req, reply): Promise<EraseResponse | void> => {
      const v = validate(EraseByMetadataSchema, req.body);
      if (!v.ok) return reply.code(400).send({ error: v.message });
      const matches = sessionsRepo.findByMetadataValue(v.data.key, v.data.value);
      for (const s of matches) await discardSession(ctx.s3, s.id);
      return { deleted: matches.length };
    });

    r.get('/sessions/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const session = sessionsRepo.get(id);
      if (!session) return reply.code(404).send({ error: 'Not found' });
      return session;
    });

    r.get('/sessions/:id/manifest', async (req, reply): Promise<SessionManifestResponse | void> => {
      const { id } = req.params as { id: string };
      const session = sessionsRepo.get(id);
      if (!session) return reply.code(404).send({ error: 'Not found' });

      const objects = await ctx.s3.list(s3keys.prefix(id) + 'events/');
      const chunks: ChunkInfo[] = objects
        .map((o) => {
          const { ts, seq } = parseChunkKey(o.key);
          return { key: o.key, seq, count: 0, firstTs: ts, lastTs: ts, bytes: o.size };
        })
        .sort((a, b) => a.seq - b.seq);

      return { session, chunks };
    });

    r.get('/sessions/:id/events', async (req, reply) => {
      const { id } = req.params as { id: string };
      const session = sessionsRepo.get(id);
      if (!session) return reply.code(404).send({ error: 'Not found' });

      const objects = await ctx.s3.list(s3keys.prefix(id) + 'events/');
      const ordered = objects
        .map((o) => ({ ...o, ...parseChunkKey(o.key) }))
        .sort((a, b) => a.seq - b.seq || a.ts - b.ts);

      const events: RrwebEvent[] = [];
      for (const obj of ordered) {
        const raw = await ctx.s3.getString(obj.key);
        const parsed = JSON.parse(raw) as RrwebEvent[];
        if (Array.isArray(parsed)) events.push(...parsed);
      }
      events.sort((a, b) => a.timestamp - b.timestamp);
      return { events };
    });

    r.get('/sessions/:id/export', async (req, reply) => {
      const { id } = req.params as { id: string };
      const session = sessionsRepo.get(id);
      if (!session) return reply.code(404).send({ error: 'Not found' });

      const objects = await ctx.s3.list(s3keys.prefix(id) + 'events/');
      const ordered = objects
        .map((o) => ({ ...o, ...parseChunkKey(o.key) }))
        .sort((a, b) => a.seq - b.seq || a.ts - b.ts);
      const events: RrwebEvent[] = [];
      for (const obj of ordered) {
        const parsed = JSON.parse(await ctx.s3.getString(obj.key)) as RrwebEvent[];
        if (Array.isArray(parsed)) events.push(...parsed);
      }
      events.sort((a, b) => a.timestamp - b.timestamp);

      reply.header('content-type', 'application/json');
      reply.header('content-disposition', `attachment; filename="${id}.json"`);
      return { session, events };
    });

    r.get('/sessions/:id/chunk', async (req, reply) => {
      const { id } = req.params as { id: string };
      const key = (req.query as { key?: string }).key;
      if (!key || !key.startsWith(s3keys.prefix(id))) {
        return reply.code(400).send({ error: 'Invalid chunk key' });
      }
      const raw = await ctx.s3.getString(key);
      reply.header('content-type', 'application/json');
      return reply.send(raw);
    });

    r.patch('/sessions/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const session = sessionsRepo.get(id);
      if (!session) return reply.code(404).send({ error: 'Not found' });
      const v = validate(UpdateSessionSchema, req.body);
      if (!v.ok) return reply.code(400).send({ error: v.message });
      sessionsRepo.update(id, v.data);
      return sessionsRepo.get(id);
    });

    r.delete('/sessions/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const session = sessionsRepo.get(id);
      if (!session) return reply.code(404).send({ error: 'Not found' });
      await discardSession(ctx.s3, id);
      return { ok: true };
    });
  });
}
