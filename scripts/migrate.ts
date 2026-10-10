/**
 * Applique les migrations versionnées (drizzle/) sur DATABASE_URL, avec un verrou consultatif :
 * deux déploiements simultanés ne migrent jamais en même temps.
 *   npm run db:migrate       → toujours
 *   npm run db:migrate:ci    → seulement si MIGRATE_ON_BUILD=1 (build Vercel de production)
 */
import { createDb } from '../server/db/client.js';
import { runMigrations } from '../server/db/migrate.js';

if (process.argv.includes('--if-enabled') && process.env.MIGRATE_ON_BUILD !== '1') {
  console.log('[migrate] ignoré (définir MIGRATE_ON_BUILD=1 pour migrer pendant le build).');
  process.exit(0);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL est obligatoire.');
  process.exit(1);
}
const handle = createDb(url, 1);
const client = await handle.pool.connect();
try {
  await client.query('select pg_advisory_lock(727274)');
  await runMigrations(handle.db);
  console.log('[migrate] base à jour.');
} finally {
  await client.query('select pg_advisory_unlock(727274)').catch(() => undefined);
  client.release();
  await handle.close();
}
