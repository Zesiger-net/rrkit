import type { MetadataBag, SessionRecord, SessionStatus } from '@rrkit/shared';
import { getDb } from './connection';
import { isValidFieldKey } from './migrate';
import { metadataFieldsRepo } from './metadataFields.repo';

interface SessionRow {
  id: string;
  ingest_key: string | null;
  ip: string | null;
  created: string;
  updated: string;
  ended: string | null;
  status: string;
  event_count: number;
  duration_ms: number;
  chunk_count: number;
  ua_browser: string | null;
  ua_os: string | null;
  ua_device: string | null;
  screen_w: number | null;
  screen_h: number | null;
  viewport_w: number | null;
  viewport_h: number | null;
  url: string | null;
  metadata: string | null;
  problem: string | null;
  starred: number;
  note: string | null;
}

/** Parse the stored metadata JSON, tolerating a corrupt row (→ null). */
function parseMetadata(raw: string | null): MetadataBag | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MetadataBag;
  } catch {
    return null;
  }
}

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    ip: row.ip,
    created: row.created,
    updated: row.updated,
    ended: row.ended,
    status: row.status as SessionStatus,
    event_count: row.event_count,
    duration_ms: row.duration_ms,
    chunk_count: row.chunk_count,
    ua_browser: row.ua_browser,
    ua_os: row.ua_os,
    ua_device: row.ua_device,
    screen_w: row.screen_w,
    screen_h: row.screen_h,
    viewport_w: row.viewport_w,
    viewport_h: row.viewport_h,
    url: row.url,
    metadata: parseMetadata(row.metadata),
    problem: row.problem,
    starred: row.starred === 1,
    note: row.note,
  };
}

export interface CreateSessionInput {
  id: string;
  ingestKey: string | null;
  ip: string | null;
  uaBrowser: string | null;
  uaOs: string | null;
  uaDevice: string | null;
  screenW: number | null;
  screenH: number | null;
  viewportW: number | null;
  viewportH: number | null;
  url: string | null;
  metadata: MetadataBag | null;
}

export interface SessionListFilters {
  page: number;
  pageSize: number;
  status?: SessionStatus;
  browser?: string;
  os?: string;
  device?: string;
  minDuration?: number;
  minEvents?: number;
  from?: string;
  to?: string;
  search?: string;
  /** Custom metadata filters keyed by field key (without the `mf_` prefix). */
  mf?: Record<string, string>;
  sort?: 'created' | 'duration_ms' | 'event_count';
  order?: 'asc' | 'desc';
}

export const sessionsRepo = {
  create(input: CreateSessionInput): SessionRecord {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO sessions
          (id, ingest_key, ip, created, updated, status, ua_browser, ua_os, ua_device,
           screen_w, screen_h, viewport_w, viewport_h, url, metadata)
         VALUES
          (@id, @ingestKey, @ip, @now, @now, 'recording', @uaBrowser, @uaOs, @uaDevice,
           @screenW, @screenH, @viewportW, @viewportH, @url, @metadata)`,
      )
      .run({
        id: input.id,
        ingestKey: input.ingestKey,
        ip: input.ip,
        now,
        uaBrowser: input.uaBrowser,
        uaOs: input.uaOs,
        uaDevice: input.uaDevice,
        screenW: input.screenW,
        screenH: input.screenH,
        viewportW: input.viewportW,
        viewportH: input.viewportH,
        url: input.url,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      });
    return this.get(input.id)!;
  },

  get(id: string): SessionRecord | null {
    const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined;
    return row ? toSession(row) : null;
  },

  /** Bump counters after a stored event chunk. Duration is wall-clock from `created`. */
  recordChunk(id: string, addedEvents: number): void {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE sessions
           SET event_count = event_count + @added,
               chunk_count = chunk_count + 1,
               updated = @now,
               duration_ms = CAST((julianday(@now) - julianday(created)) * 86400000 AS INTEGER)
         WHERE id = @id`,
      )
      .run({ id, added: addedEvents, now });
  },

  mergeMetadata(id: string, delta: MetadataBag): void {
    const current = this.get(id);
    if (!current) return;
    const merged = { ...(current.metadata ?? {}), ...delta };
    getDb()
      .prepare('UPDATE sessions SET metadata = @metadata, updated = @now WHERE id = @id')
      .run({ id, metadata: JSON.stringify(merged), now: new Date().toISOString() });
  },

  finalize(id: string, status: SessionStatus, problem?: string | null): void {
    const now = new Date().toISOString();
    // Duration is measured to the *last activity* (`updated`), not finalize
    // time — otherwise the stale-finalize job (which runs long after the last
    // event) would pad the session length with dead idle time.
    getDb()
      .prepare(
        `UPDATE sessions
           SET status = @status, ended = @now,
               duration_ms = CAST((julianday(updated) - julianday(created)) * 86400000 AS INTEGER),
               updated = @now,
               problem = COALESCE(@problem, problem)
         WHERE id = @id`,
      )
      .run({ id, status, now, problem: problem ?? null });
  },

  setProblem(id: string, problem: string): void {
    getDb().prepare('UPDATE sessions SET problem = ? WHERE id = ?').run(problem, id);
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
  },

  /** Update triage fields (star / note). */
  update(id: string, fields: { starred?: boolean; note?: string }): void {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };
    if (fields.starred !== undefined) {
      sets.push('starred = @starred');
      params.starred = fields.starred ? 1 : 0;
    }
    if (fields.note !== undefined) {
      sets.push('note = @note');
      params.note = fields.note;
    }
    if (sets.length === 0) return;
    getDb()
      .prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = @id`)
      .run(params);
  },

  /** All sessions whose metadata `key` equals `value` (for right-to-erasure). */
  findByMetadataValue(key: string, value: string): SessionRecord[] {
    const rows = getDb()
      .prepare("SELECT * FROM sessions WHERE json_extract(metadata, '$.' || @key) = @value")
      .all({ key, value }) as SessionRow[];
    return rows.map(toSession);
  },

  /** Sessions whose recording stalled (no update within the cutoff). */
  findStale(cutoffIso: string): SessionRecord[] {
    const rows = getDb()
      .prepare("SELECT * FROM sessions WHERE status = 'recording' AND updated < ?")
      .all(cutoffIso) as SessionRow[];
    return rows.map(toSession);
  },

  /** Sessions created before the cutoff (for retention). */
  findOlderThan(cutoffIso: string, limit: number): SessionRecord[] {
    const rows = getDb()
      .prepare('SELECT * FROM sessions WHERE created < ? ORDER BY created ASC LIMIT ?')
      .all(cutoffIso, limit) as SessionRow[];
    return rows.map(toSession);
  },

  list(filters: SessionListFilters): { items: SessionRecord[]; total: number } {
    const { where, params } = buildWhere(filters);
    const sortCol =
      filters.sort && ['created', 'duration_ms', 'event_count'].includes(filters.sort)
        ? filters.sort
        : 'created';
    const order = filters.order === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(Math.max(filters.pageSize, 1), 100);
    const offset = (Math.max(filters.page, 1) - 1) * limit;

    const total = (
      getDb()
        .prepare(`SELECT COUNT(*) AS n FROM sessions ${where}`)
        .get(params) as { n: number }
    ).n;

    const rows = getDb()
      .prepare(
        `SELECT * FROM sessions ${where} ORDER BY ${sortCol} ${order} LIMIT @__limit OFFSET @__offset`,
      )
      .all({ ...params, __limit: limit, __offset: offset }) as SessionRow[];

    return { items: rows.map(toSession), total };
  },

  stats(): { total: number; recording: number; completed: number; failed: number } {
    const rows = getDb()
      .prepare('SELECT status, COUNT(*) AS n FROM sessions GROUP BY status')
      .all() as Array<{ status: string; n: number }>;
    const out = { total: 0, recording: 0, completed: 0, failed: 0 };
    for (const r of rows) {
      out.total += r.n;
      if (r.status === 'recording') out.recording = r.n;
      else if (r.status === 'completed') out.completed = r.n;
      else if (r.status === 'failed') out.failed = r.n;
    }
    return out;
  },

  facets(): { browser: string[]; os: string[]; device: string[] } {
    const distinct = (col: 'ua_browser' | 'ua_os' | 'ua_device'): string[] =>
      (
        getDb()
          .prepare(`SELECT DISTINCT ${col} AS v FROM sessions WHERE ${col} IS NOT NULL ORDER BY v`)
          .all() as Array<{ v: string }>
      ).map((r) => r.v);
    return { browser: distinct('ua_browser'), os: distinct('ua_os'), device: distinct('ua_device') };
  },
};

function buildWhere(filters: SessionListFilters): {
  where: string;
  params: Record<string, unknown>;
} {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.status) {
    clauses.push('status = @status');
    params.status = filters.status;
  }
  if (filters.browser) {
    clauses.push('ua_browser = @browser');
    params.browser = filters.browser;
  }
  if (filters.os) {
    clauses.push('ua_os = @os');
    params.os = filters.os;
  }
  if (filters.device) {
    clauses.push('ua_device = @device');
    params.device = filters.device;
  }
  if (typeof filters.minDuration === 'number') {
    clauses.push('duration_ms >= @minDuration');
    params.minDuration = filters.minDuration;
  }
  if (typeof filters.minEvents === 'number') {
    clauses.push('event_count >= @minEvents');
    params.minEvents = filters.minEvents;
  }
  if (filters.from) {
    clauses.push('created >= @from');
    params.from = filters.from;
  }
  if (filters.to) {
    clauses.push('created <= @to');
    params.to = filters.to;
  }
  if (filters.search) {
    clauses.push('(id LIKE @search OR ip LIKE @search OR metadata LIKE @search)');
    params.search = `%${filters.search}%`;
  }

  // Custom metadata filters — only against existing, filterable, validated columns.
  if (filters.mf) {
    const filterable = new Set(metadataFieldsRepo.filterableKeys());
    for (const [key, value] of Object.entries(filters.mf)) {
      if (!isValidFieldKey(key) || !filterable.has(key)) continue;
      const param = `mf_${key}`;
      clauses.push(`mf_${key} = @${param}`);
      params[param] = String(value);
    }
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}
