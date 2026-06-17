import fs from 'node:fs';
import path from 'node:path';

export interface Env {
  port: number;
  host: string;
  dbPath: string;
  /** Directory containing the built dashboard (Next.js static export). Null in dev if not built. */
  staticDir: string | null;
  /** Absolute path to the tracker IIFE bundle served at /tracker.js. Null if not built. */
  trackerPath: string | null;
}

function firstExisting(...candidates: (string | undefined)[]): string | null {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

export function loadEnv(): Env {
  const port = Number.parseInt(process.env.RRKIT_PORT ?? '3000', 10);
  const host = process.env.RRKIT_HOST ?? '0.0.0.0';
  const dbPath = process.env.RRKIT_DB_PATH ?? path.resolve(process.cwd(), 'data', 'rrkit.db');

  // In the container the dashboard export and tracker bundle are copied here.
  const staticDir = firstExisting(
    process.env.RRKIT_STATIC_DIR,
    path.resolve(__dirname, '../../../dashboard/out'),
  );

  const trackerPath = firstExisting(
    process.env.RRKIT_TRACKER_PATH,
    staticDir ? path.join(staticDir, 'tracker.js') : undefined,
    path.resolve(__dirname, '../../../tracker/dist/tracker.global.js'),
  );

  return { port, host, dbPath, staticDir, trackerPath };
}
