import { MIN_SESSION_DURATION_MS, MIN_SESSION_EVENT_COUNT } from '@rrkit/shared';
import { sessionsRepo } from '../db/sessions.repo';
import { S3Service, s3keys } from './s3.service';

/**
 * Finalize a recording session: keep it if it meets the minimum thresholds,
 * otherwise discard it (delete S3 objects + the row).
 */
export async function finalizeSession(s3: S3Service, id: string): Promise<void> {
  const session = sessionsRepo.get(id);
  if (!session || session.status !== 'recording') return;

  const keep =
    session.duration_ms >= MIN_SESSION_DURATION_MS &&
    session.event_count >= MIN_SESSION_EVENT_COUNT;

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
  sessionsRepo.delete(id);
}
