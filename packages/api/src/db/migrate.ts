import type Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations';

/** Run pending migrations inside transactions, tracked via PRAGMA user_version. */
export function runMigrations(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const tx = db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    });
    tx();
  }
}

/**
 * Ensure every `filterable` metadata field has an indexed virtual generated
 * column `mf_<key>` extracting its value from the JSON `metadata` column. This
 * makes `WHERE mf_<key> = ?` indexed without rewriting existing rows.
 *
 * Safe to run on every boot — it only adds what is missing.
 */
export function reconcileMetadataColumns(db: Database.Database): void {
  // `table_xinfo` (not `table_info`) is required here: `table_info` omits
  // VIRTUAL generated columns, so the `mf_*` columns we add below would be
  // invisible and re-added on the next run, failing with "duplicate column".
  const existing = new Set(
    (db.pragma('table_xinfo(sessions)') as Array<{ name: string }>).map((c) => c.name),
  );

  const fields = db
    .prepare('SELECT key FROM metadata_fields WHERE filterable = 1')
    .all() as Array<{ key: string }>;

  for (const { key } of fields) {
    if (!isValidFieldKey(key)) continue;
    const col = `mf_${key}`;
    if (existing.has(col)) continue;
    // VIRTUAL avoids rewriting existing rows; the index materialises the value.
    db.exec(
      `ALTER TABLE sessions ADD COLUMN ${col} TEXT ` +
        `GENERATED ALWAYS AS (json_extract(metadata, '$.${key}')) VIRTUAL`,
    );
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${col} ON sessions (${col})`);
  }
}

/** Field keys are strictly validated before being used in DDL. */
export function isValidFieldKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{0,30}$/.test(key);
}
