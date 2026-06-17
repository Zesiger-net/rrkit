import { initDb } from './db/connection';
import { reconcileMetadataColumns, runMigrations } from './db/migrate';
import { settingsRepo } from './db/settings.repo';
import { loadEnv } from './config/env';
import { buildApp } from './server';
import { S3Service } from './services/s3.service';
import { startJobs } from './jobs/scheduler';
import { generateSecret } from './util/ids';

async function main(): Promise<void> {
  const env = loadEnv();

  // Database: open, migrate, ensure indexed metadata columns exist.
  const db = initDb(env.dbPath);
  runMigrations(db);
  reconcileMetadataColumns(db);

  // Ensure a stable, auto-generated JWT signing key (zero-config secret).
  let auth = settingsRepo.getAuth();
  if (!auth) {
    auth = { passwordHash: null, jwtSecret: generateSecret() };
    settingsRepo.setAuth(auth);
  }

  // Configure S3 from stored settings, if setup has been done.
  const s3 = new S3Service();
  const s3cfg = settingsRepo.getS3();
  if (s3cfg) s3.configure(s3cfg);

  const app = await buildApp({ env, s3, jwtSecret: auth.jwtSecret });

  await app.listen({ port: env.port, host: env.host });
  app.log.info(
    { port: env.port, dbPath: env.dbPath, static: env.staticDir ?? '(dev: served by Next)' },
    'rrkit started',
  );

  startJobs({ env, s3 }, app.log);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
