import { sessionsRepo } from '../db/sessions.repo';
import { settingsRepo } from '../db/settings.repo';
import { signalsRepo } from '../db/signals.repo';
import { S3Service, s3keys } from './s3.service';

/**
 * Finalize a recording session: keep it if it meets the minimum thresholds,
 * otherwise discard it (delete S3 objects + the row). Thresholds come from the
 * admin-configurable session policy.
 */
export async function finalizeSession(s3: S3Service, id: string): Promise<void> {
  const session = sessionsRepo.get(id);
  if (!session || session.status !== 'recording') return;

  const policy = settingsRepo.getSessionPolicy();
  const keep =
    session.duration_ms >= policy.minDurationMs &&
    session.event_count >= policy.minEventCount;

  if (keep) {
    sessionsRepo.finalize(id, 'completed');
  } else {
    await discardSession(s3, id);
  }
}

export async function discardSession(s3: S3Service, id: string): Promise<void> {
  if (s3.isConfigured()) {
    try {
      await s3.deletePrefix(s3keys.prefix(id));
    } catch {
      // Best effort — the orphan/retention paths will catch leftovers.
    }
  }
  signalsRepo.deleteForSession(id);
  sessionsRepo.delete(id);
}
