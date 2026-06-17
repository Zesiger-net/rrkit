import type { FastifyInstance } from 'fastify';
import { ChangePasswordSchema, COOKIE_NAME, LoginSchema } from '@rrkit/shared';
import type { AppContext } from '../context';
import { settingsRepo } from '../db/settings.repo';
import { hashPassword, verifyPassword } from '../util/password';
import { validate } from '../util/validate';

export async function authRoutes(app: FastifyInstance, _ctx: AppContext): Promise<void> {
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const v = validate(LoginSchema, req.body);
      if (!v.ok) return reply.code(400).send({ error: v.message });

      const auth = settingsRepo.getAuth();
      if (!auth?.passwordHash || !verifyPassword(v.data.password, auth.passwordHash)) {
        return reply.code(401).send({ error: 'Incorrect password' });
      }

      const token = await reply.jwtSign({ sub: 'admin' }, { expiresIn: '7d' });
      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
      return { ok: true };
    },
  );

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.post('/auth/change-password', { preHandler: app.requireAdmin }, async (req, reply) => {
    const v = validate(ChangePasswordSchema, req.body);
    if (!v.ok) return reply.code(400).send({ error: v.message });

    const auth = settingsRepo.getAuth();
    if (!auth?.passwordHash || !verifyPassword(v.data.currentPassword, auth.passwordHash)) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }
    settingsRepo.setAuth({ ...auth, passwordHash: hashPassword(v.data.newPassword) });
    return { ok: true };
  });
}
