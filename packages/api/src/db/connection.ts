import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
  if (db) return db;

  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  // WAL gives concurrent dashboard reads alongside the single ingest writer.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('wal_autocheckpoint = 1000');
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialised — call initDb() first.');
  return db;
}
