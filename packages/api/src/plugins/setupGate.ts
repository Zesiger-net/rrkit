import type { FastifyReply, FastifyRequest } from 'fastify';
import { settingsRepo } from '../db/settings.repo';

/**
 * Until setup is complete, only the setup/health/status APIs and the static
 * dashboard assets are reachable. Everything else returns 423 Locked.
 */
export async function setupGate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (settingsRepo.getSetup().complete) return;

  const url = req.url;
  const isApi = url.startsWith('/api/');
  if (!isApi) return; // static assets + SPA so the wizard can render

  if (
    url.startsWith('/api/setup') ||
    url === '/api/health' ||
    url === '/api/metrics' ||
    url.startsWith('/api/status')
  ) {
    return;
  }

  return reply.code(423).send({ error: 'Setup required', code: 'SETUP_REQUIRED' });
}
