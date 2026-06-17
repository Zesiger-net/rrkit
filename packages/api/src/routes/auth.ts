import type { FastifyInstance } from 'fastify';
import { ChangePasswordSchema, COOKIE_NAME, LoginSchema } from '@rrkit/shared';
import type { AppContext } from '../context';
import { settingsRepo } from '../db/settings.repo';
import { hashPassword, verifyPassword } from '../util/password';
import { validate } from '../util/validate';

/** Brute-force lockout: after FAIL_LIMIT bad attempts an IP is locked LOCK_MS. */
const FAIL_LIMIT = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; until: number }>();

function isLocked(ip: string): boolean {
  const f = failures.get(ip);
  return !!f && f.until > Date.now();
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const f = failures.get(ip);
  const count = (f && f.until > now ? f.count : 0) + 1;
  failures.set(ip, { count, until: count >= FAIL_LIMIT ? now + LOCK_MS : now + 60_000 });
}

export async function authRoutes(app: FastifyInstance, _ctx: AppContext): Promise<void> {
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const v = validate(LoginSchema, req.body);
      if (!v.ok) return reply.code(400).send({ error: v.message });

      if (isLocked(req.ip)) {
        return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
      }

      const auth = settingsRepo.getAuth();
      if (!auth?.passwordHash || !verifyPassword(v.data.password, auth.passwordHash)) {
        recordFailure(req.ip);
        return reply.code(401).send({ error: 'Incorrect password' });
      }
      failures.delete(req.ip);

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
