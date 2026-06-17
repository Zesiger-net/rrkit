import type { FastifyBaseLogger } from 'fastify';
import { settingsRepo } from '../db/settings.repo';
import { sessionsRepo } from '../db/sessions.repo';
import { signalsRepo } from '../db/signals.repo';
import type { AppContext } from '../context';
import { discardSession, finalizeSession } from '../services/sessionService';

const RETENTION_INTERVAL_MS = 60 * 60 * 1000; // hourly
const STALE_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const ALERTS_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const STALE_CUTOFF_MS = 90 * 1000; // recording sessions idle this long are finalized
const RETENTION_BATCH = 500;
const ALERT_WINDOW_MS = 60 * 60 * 1000; // look back one hour
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // re-notify the same issue at most hourly
const RAGE_ALERT_KEY = '__rage__';

export function startJobs(ctx: AppContext, log: FastifyBaseLogger): () => void {
  let retentionRunning = false;
  let staleRunning = false;
  let alertsRunning = false;

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

  const alertsTimer = setInterval(() => {
    if (alertsRunning) return;
    alertsRunning = true;
    runAlerts(log)
      .catch((err) => log.error({ err }, 'alerts job failed'))
      .finally(() => {
        alertsRunning = false;
      });
  }, ALERTS_INTERVAL_MS);

  retentionTimer.unref();
  staleTimer.unref();
  alertsTimer.unref();

  return () => {
    clearInterval(retentionTimer);
    clearInterval(staleTimer);
    clearInterval(alertsTimer);
  };
}

const WEBHOOK_TIMEOUT_MS = 10_000;

async function postWebhook(url: string, text: string): Promise<void> {
  // Bound the request so a slow/hung webhook can't wedge the alerts job (which
  // is single-flighted by the `alertsRunning` guard) indefinitely.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`webhook responded ${res.status}`);
}

export async function runAlerts(log: FastifyBaseLogger): Promise<void> {
  if (!settingsRepo.getSetup().complete) return;
  const cfg = settingsRepo.getAlerts();
  if (!cfg.enabled || !cfg.webhookUrl) return;

  const since = new Date(Date.now() - ALERT_WINDOW_MS).toISOString();
  const now = Date.now();
  const cooledDown = (iso: string | undefined): boolean =>
    !iso || now - new Date(iso).getTime() >= ALERT_COOLDOWN_MS;

  for (const issue of signalsRepo.issuesSince(since)) {
    const state = signalsRepo.getAlertState(issue.fingerprint);
    const isNew = !state;
    const spike = issue.count >= cfg.errorSpikeThreshold;
    const shouldNotify =
      cooledDown(state?.last_notified) && ((cfg.notifyNewIssues && isNew) || spike);

    if (shouldNotify) {
      try {
        await postWebhook(
          cfg.webhookUrl,
          `:warning: rrkit error issue (${issue.count}× in the last hour): ${issue.message ?? issue.fingerprint}`,
        );
        // Only start the cooldown once the notification actually went out, so a
        // transient webhook failure is retried on the next run.
        signalsRepo.setAlertState(issue.fingerprint, issue.count);
      } catch (err) {
        log.warn({ err }, 'alert webhook failed');
      }
    } else if (isNew) {
      // Record it so it isn't treated as "new" forever, even when not notified.
      signalsRepo.setAlertState(issue.fingerprint, issue.count);
    }
  }

  if (cfg.notifyRage) {
    const rage = signalsRepo.rageCountSince(since);
    const state = signalsRepo.getAlertState(RAGE_ALERT_KEY);
    if (rage > 0 && cooledDown(state?.last_notified)) {
      try {
        await postWebhook(cfg.webhookUrl, `:rage: ${rage} rage-click cluster(s) in the last hour`);
        signalsRepo.setAlertState(RAGE_ALERT_KEY, rage);
      } catch (err) {
        log.warn({ err }, 'rage alert webhook failed');
      }
    }
  }
}

export async function runRetention(ctx: AppContext, log: FastifyBaseLogger): Promise<void> {
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

export async function runStaleFinalize(ctx: AppContext, log: FastifyBaseLogger): Promise<void> {
  if (!settingsRepo.getSetup().complete) return;
  const cutoff = new Date(Date.now() - STALE_CUTOFF_MS).toISOString();
  const stale = sessionsRepo.findStale(cutoff);
  if (stale.length === 0) return;
  for (const session of stale) {
    await finalizeSession(ctx.s3, session.id);
  }
  log.info({ finalized: stale.length }, 'stale-finalize job processed sessions');
}
