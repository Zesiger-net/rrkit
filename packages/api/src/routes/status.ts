import type { FastifyInstance } from 'fastify';
import type { StatusResponse } from '@rrkit/shared';
import type { AppContext } from '../context';
import { settingsRepo } from '../db/settings.repo';

export async function statusRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/status', async (req): Promise<StatusResponse> => {
    let authed = false;
    try {
      await req.jwtVerify();
      authed = true;
    } catch {
      authed = false;
    }
    return {
      setupComplete: settingsRepo.getSetup().complete,
      authed,
    };
  });
}
