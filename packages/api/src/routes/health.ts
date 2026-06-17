import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';

export async function healthRoutes(app: FastifyInstance, _ctx: AppContext): Promise<void> {
  // Returns 200 even while setup is incomplete, so first-run is "healthy".
  app.get('/health', async () => ({ status: 'ok' }));
}
