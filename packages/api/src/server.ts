import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { INGEST_KEY_HEADER, MAX_BATCH_BYTES } from '@rrkit/shared';
import type { Env } from './config/env';
import type { AppContext } from './context';
import type { S3Service } from './services/s3.service';
import { registerAuth } from './plugins/auth';
import { setupGate } from './plugins/setupGate';
import { registerStatic } from './plugins/static';
import { authRoutes } from './routes/auth';
import { configRoutes } from './routes/config';
import { healthRoutes } from './routes/health';
import { ingestRoutes } from './routes/ingest';
import { metricsRoutes } from './routes/metrics';
import { sessionRoutes } from './routes/sessions';
import { settingsRoutes } from './routes/settings';
import { setupRoutes } from './routes/setup';
import { statusRoutes } from './routes/status';

export interface BuildOptions {
  env: Env;
  s3: S3Service;
  jwtSecret: string;
}

export async function buildApp(opts: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.RRKIT_LOG_LEVEL ?? 'info' },
    bodyLimit: MAX_BATCH_BYTES + 1024 * 1024,
    trustProxy: true,
  });

  app.decorate('s3', opts.s3);

  await app.register(sensible);
  await app.register(cookie);
  await registerAuth(app, opts.jwtSecret);
  await app.register(rateLimit, { global: false, max: 1000, timeWindow: '1 minute' });
  await app.register(cors, {
    origin: true,
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', INGEST_KEY_HEADER],
  });

  // Lock everything but setup/health/status + static assets until setup completes.
  app.addHook('onRequest', setupGate);

  const ctx: AppContext = { env: opts.env, s3: opts.s3 };

  await app.register(
    async (api) => {
      await healthRoutes(api, ctx);
      await metricsRoutes(api, ctx);
      await statusRoutes(api, ctx);
      await setupRoutes(api, ctx);
      await authRoutes(api, ctx);
      await configRoutes(api, ctx);
      await ingestRoutes(api, ctx);
      await sessionRoutes(api, ctx);
      await settingsRoutes(api, ctx);
    },
    { prefix: '/api' },
  );

  await registerStatic(app, opts.env);

  return app;
}
