import type { FrustrationSummary, IssueRecord } from '@rrkit/shared';
import type { ExtractedSignal } from '../util/signals';
import { getDb } from './connection';

export interface AlertState {
  fingerprint: string;
  last_notified: string;
  last_count: number;
}

export interface RecentIssue {
  fingerprint: string;
  message: string | null;
  count: number;
}

export const signalsRepo = {
  insertMany(sessionId: string, signals: ExtractedSignal[]): void {
    if (signals.length === 0) return;
    const now = new Date().toISOString();
    const stmt = getDb().prepare(
      `INSERT INTO session_signals (session_id, kind, fingerprint, message, ts, created)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const tx = getDb().transaction((rows: ExtractedSignal[]) => {
      for (const s of rows) stmt.run(sessionId, s.kind, s.fingerprint, s.message, s.ts, now);
    });
    tx(signals);
  },

  deleteForSession(sessionId: string): void {
    getDb().prepare('DELETE FROM session_signals WHERE session_id = ?').run(sessionId);
  },

  /** Grouped error issues, most frequent first. */
  listIssues(limit = 100): IssueRecord[] {
    return getDb()
      .prepare(
        `SELECT s1.fingerprint                                    AS fingerprint,
                COUNT(*)                                          AS count,
                COUNT(DISTINCT s1.session_id)                     AS sessions,
                MIN(s1.created)                                   AS firstSeen,
                MAX(s1.created)                                   AS lastSeen,
                (SELECT s2.message FROM session_signals s2
                  WHERE s2.fingerprint = s1.fingerprint AND s2.message IS NOT NULL
                  ORDER BY s2.id DESC LIMIT 1)                    AS message
           FROM session_signals s1
          WHERE s1.kind = 'error' AND s1.fingerprint IS NOT NULL
          GROUP BY s1.fingerprint
          ORDER BY count DESC
          LIMIT ?`,
      )
      .all(limit) as IssueRecord[];
  },

  frustration(): FrustrationSummary {
    const count = (kind: string): number =>
      (getDb().prepare('SELECT COUNT(*) AS n FROM session_signals WHERE kind = ?').get(kind) as {
        n: number;
      }).n;
    const errorIssues = (
      getDb()
        .prepare("SELECT COUNT(DISTINCT fingerprint) AS n FROM session_signals WHERE kind = 'error'")
        .get() as { n: number }
    ).n;
    return {
      errors: count('error'),
      errorIssues,
      rage: count('rage'),
      deadclick: count('deadclick'),
    };
  },

  /** Error issues seen since `sinceIso`, for the alerts job. */
  issuesSince(sinceIso: string): RecentIssue[] {
    return getDb()
      .prepare(
        `SELECT s1.fingerprint AS fingerprint,
                COUNT(*)       AS count,
                (SELECT s2.message FROM session_signals s2
                  WHERE s2.fingerprint = s1.fingerprint ORDER BY s2.id DESC LIMIT 1) AS message
           FROM session_signals s1
          WHERE s1.kind = 'error' AND s1.fingerprint IS NOT NULL AND s1.created >= ?
          GROUP BY s1.fingerprint`,
      )
      .all(sinceIso) as RecentIssue[];
  },

  rageCountSince(sinceIso: string): number {
    return (
      getDb()
        .prepare("SELECT COUNT(*) AS n FROM session_signals WHERE kind = 'rage' AND created >= ?")
        .get(sinceIso) as { n: number }
    ).n;
  },

  getAlertState(fingerprint: string): AlertState | null {
    return (
      (getDb()
        .prepare('SELECT * FROM alert_state WHERE fingerprint = ?')
        .get(fingerprint) as AlertState | undefined) ?? null
    );
  },

  setAlertState(fingerprint: string, count: number): void {
    getDb()
      .prepare(
        `INSERT INTO alert_state (fingerprint, last_notified, last_count)
         VALUES (@fp, @now, @count)
         ON CONFLICT(fingerprint) DO UPDATE SET last_notified = @now, last_count = @count`,
      )
      .run({ fp: fingerprint, now: new Date().toISOString(), count });
  },
};
