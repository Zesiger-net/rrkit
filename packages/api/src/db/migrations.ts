export interface Migration {
  version: number;
  sql: string;
}

/** Ordered migrations. Applied when PRAGMA user_version is lower than `version`. */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: /* sql */ `
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE metadata_fields (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        key        TEXT UNIQUE NOT NULL,
        label      TEXT NOT NULL,
        type       TEXT NOT NULL,
        filterable INTEGER NOT NULL DEFAULT 0,
        created    TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id          TEXT PRIMARY KEY,
        ingest_key  TEXT,
        ip          TEXT,
        created     TEXT NOT NULL,
        updated     TEXT NOT NULL,
        ended       TEXT,
        status      TEXT NOT NULL DEFAULT 'recording',
        event_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        ua_browser  TEXT,
        ua_os       TEXT,
        ua_device   TEXT,
        screen_w    INTEGER,
        screen_h    INTEGER,
        viewport_w  INTEGER,
        viewport_h  INTEGER,
        url         TEXT,
        metadata    TEXT,
        problem     TEXT
      );

      CREATE INDEX idx_sessions_created ON sessions (created DESC);
      CREATE INDEX idx_sessions_status  ON sessions (status);
      CREATE INDEX idx_sessions_browser ON sessions (ua_browser);
      CREATE INDEX idx_sessions_os      ON sessions (ua_os);
      CREATE INDEX idx_sessions_device  ON sessions (ua_device);
    `,
  },
];
