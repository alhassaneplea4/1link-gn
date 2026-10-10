/**
 * Applique les migrations versionnées (drizzle/) sur DATABASE_URL, avec un verrou consultatif :
 * deux déploiements simultanés ne migrent jamais en même temps.
 *   npm run db:migrate       → toujours
 *   npm run db:migrate:ci    → seulement si MIGRATE_ON_BUILD=1 (build Vercel de production)
 */
import { createDb } from '../server/db/client.js';
import { runMigrations } from '../server/db/migrate.js';

// Au build : migre automatiquement en PRODUCTION (la nouvelle version ne part en ligne que si le schéma est à jour) ;
// ailleurs seulement si MIGRATE_ON_BUILD=1 ; MIGRATE_ON_BUILD=0 désactive tout.
const auto = process.env.MIGRATE_ON_BUILD === '1' || (process.env.VERCEL_ENV === 'production' && process.env.MIGRATE_ON_BUILD !== '0');
if (process.argv.includes('--if-enabled') && !auto) {
  console.log('[migrate] ignoré (build hors production ; définir MIGRATE_ON_BUILD=1 pour migrer).');
  process.exit(0);
}
// Neon fournit DATABASE_URL (pooler) et DATABASE_URL_UNPOOLED (directe) : les migrations utilisent la directe (verrou de session).
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL est obligatoire.');
  process.exit(1);
}
// Une base serverless (Neon) en veille ou fraîchement créée peut mettre plusieurs secondes à répondre : on patiente et on réessaie.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (let attempt = 1; ; attempt++) {
  const handle = createDb(url, 2, { connectionTimeoutMs: 45_000 }) // 2 connexions : une garde le verrou, l'autre applique les migrations;
  try {
    const client = await handle.pool.connect();
    try {
      await client.query('select pg_advisory_lock(727274)');
      await runMigrations(handle.db);
      console.log('[migrate] base à jour.');
    } finally {
      await client.query('select pg_advisory_unlock(727274)').catch(() => undefined);
      client.release();
    }
    await handle.close();
    break;
  } catch (e) {
    await handle.close().catch(() => undefined);
    const message = (e as Error).message;
    if (attempt >= 4 || !/timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|terminating connection|EAI_AGAIN/i.test(message)) {
      console.error('[migrate] échec :', message);
      process.exit(1);
    }
    console.warn(`[migrate] base injoignable (tentative ${attempt}/4) : ${message} — nouvel essai dans 5 s`);
    await wait(5_000);
  }
}
