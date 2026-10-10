import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareTemplate, startTestPostgres } from './harness.js';

/** Vitest : démarre UN PostgreSQL réel pour toute la session de tests (chaque fichier de test reçoit sa propre base). */
export default async function setup() {
  if (process.env.TEST_DATABASE_ADMIN_URL) {
    await prepareTemplate(process.env.TEST_DATABASE_ADMIN_URL); // serveur fourni (CI avec service Postgres)
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'onelink-pg-'));
  const { pg, adminUrl } = await startTestPostgres(dir);
  process.env.TEST_DATABASE_ADMIN_URL = adminUrl;
  return async () => {
    await pg.stop().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  };
}
