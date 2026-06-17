import type { FastifyBaseLogger } from 'fastify';
import { settingsRepo } from '../db/settings.repo';
import { sessionsRepo } from '../db/sessions.repo';
import type { AppContext } from '../context';
import { discardSession, finalizeSession } from '../services/sessionService';

const RETENTION_INTERVAL_MS = 60 * 60 * 1000; // hourly
const STALE_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const STALE_CUTOFF_MS = 90 * 1000; // recording sessions idle this long are finalized
const RETENTION_BATCH = 500;

export function startJobs(ctx: AppContext, log: FastifyBaseLogger): () => void {
  let retentionRunning = false;
  let staleRunning = false;

  const retentionTimer = setInterval(() => {
    if (retentionRunning) return;
    retentionRunning = true;
    runRetention(ctx, log)
      .catch((err) => log.error({ err }, 'retention job failed'))
      .finally(() => {
        retentionRunning = false;
      });
  }, RETENTION_INTERVAL_MS);

  const staleTimer = setInterval(() => {
    if (staleRunning) return;
    staleRunning = true;
    runStaleFinalize(ctx, log)
      .catch((err) => log.error({ err }, 'stale-finalize job failed'))
      .finally(() => {
        staleRunning = false;
      });
  }, STALE_INTERVAL_MS);

  retentionTimer.unref();
  staleTimer.unref();

  return () => {
    clearInterval(retentionTimer);
    clearInterval(staleTimer);
  };
}

async function runRetention(ctx: AppContext, log: FastifyBaseLogger): Promise<void> {
  if (!settingsRepo.getSetup().complete) return;
  const days = settingsRepo.getRetention().days;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const old = sessionsRepo.findOlderThan(cutoff, RETENTION_BATCH);
  if (old.length === 0) return;
  for (const session of old) {
    await discardSession(ctx.s3, session.id);
  }
  log.info({ deleted: old.length, days }, 'retention job removed old sessions');
}

async function runStaleFinalize(ctx: AppContext, log: FastifyBaseLogger): Promise<void> {
  if (!settingsRepo.getSetup().complete) return;
  const cutoff = new Date(Date.now() - STALE_CUTOFF_MS).toISOString();
  const stale = sessionsRepo.findStale(cutoff);
  if (stale.length === 0) return;
  for (const session of stale) {
    await finalizeSession(ctx.s3, session.id);
  }
  log.info({ finalized: stale.length }, 'stale-finalize job processed sessions');
}
