import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { sessionsRepo } from '../db/sessions.repo';
import { signalsRepo } from '../db/signals.repo';
import { settingsRepo } from '../db/settings.repo';

/**
 * Prometheus text-format metrics (aggregate only, no per-session detail).
 * Public so a scraper can reach it; restrict at the reverse proxy if needed.
 */
export async function metricsRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', 'text/plain; version=0.0.4');
    if (!settingsRepo.getSetup().complete) return 'rrkit_setup_complete 0\n';

    const s = sessionsRepo.stats();
    const f = signalsRepo.frustration();
    const lines = [
      '# HELP rrkit_setup_complete Whether initial setup finished',
      '# TYPE rrkit_setup_complete gauge',
      'rrkit_setup_complete 1',
      '# HELP rrkit_sessions Total sessions by status',
      '# TYPE rrkit_sessions gauge',
      `rrkit_sessions_total ${s.total}`,
      `rrkit_sessions{status="recording"} ${s.recording}`,
      `rrkit_sessions{status="completed"} ${s.completed}`,
      `rrkit_sessions{status="failed"} ${s.failed}`,
      '# HELP rrkit_signals Indexed frustration/error signals by kind',
      '# TYPE rrkit_signals gauge',
      `rrkit_signals{kind="error"} ${f.errors}`,
      `rrkit_signals{kind="rage"} ${f.rage}`,
      `rrkit_signals{kind="deadclick"} ${f.deadclick}`,
      `rrkit_error_issues ${f.errorIssues}`,
      `# rrkit version ${ctx.env.version}`,
    ];
    return lines.join('\n') + '\n';
  });
}
