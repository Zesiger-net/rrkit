import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';

/** Serve the tracker bundle and the built dashboard SPA (with client-route fallback). */
export async function registerStatic(app: FastifyInstance, env: Env): Promise<void> {
  if (env.trackerPath) {
    const trackerPath = env.trackerPath;
    app.get('/tracker.js', (_req, reply) => {
      reply.header('content-type', 'application/javascript; charset=utf-8');
      reply.header('cache-control', 'public, max-age=300');
      return reply.send(fs.createReadStream(trackerPath));
    });
  }

  if (!env.staticDir) return;
  const staticDir = env.staticDir;

  await app.register(fastifyStatic, {
    root: staticDir,
    prefix: '/',
    index: ['index.html'],
    redirect: true,
  });

  // SPA fallback: serve index.html for unknown client routes; JSON 404 for APIs.
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    reply.header('content-type', 'text/html; charset=utf-8');
    return reply.send(fs.createReadStream(path.join(staticDir, 'index.html')));
  });
}
