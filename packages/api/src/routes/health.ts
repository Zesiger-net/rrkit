import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';

export async function healthRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // Returns 200 even while setup is incomplete, so first-run is "healthy".
  app.get('/health', async () => ({ status: 'ok', version: ctx.env.version }));
}
