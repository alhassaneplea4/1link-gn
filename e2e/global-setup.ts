/**
 * e2e : un VRAI PostgreSQL (embarqué, jetable) et le VRAI serveur d'API démarrent avant les tests. L'interface (vite preview)
 * leur envoie ses requêtes /api par proxy, exactement comme sur Vercel (même origine). Rien n'est simulé.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createDb } from '../server/db/client.js';
import { runMigrations } from '../server/db/migrate.js';
import { createRuntimeApp } from '../server/runtime.js';
import { startLocalPostgres } from '../server/testing/local-postgres.js';

export const API_PORT = 8788;

export default async function globalSetup() {
  const dir = mkdtempSync(join(tmpdir(), 'onelink-e2e-pg-'));
  const pg = await startLocalPostgres({ dir, fast: true, quiet: true });
  await pg.createDatabase('onelink_e2e');
  const url = pg.url('onelink_e2e');
  const migration = createDb(url, 2);
  await runMigrations(migration.db);
  await migration.close();
  process.env.E2E_DATABASE_URL = url; // lu par les workers (création des comptes de test)

  const { app, close } = await createRuntimeApp({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    APP_URL: 'http://localhost:4173',
    APP_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
    ENABLE_DEV_ROUTES: '1',
    RATE_LIMIT_SCALE: '1000', // tous les navigateurs de test partagent la même adresse IP
  });
  const server = serve({ fetch: app.fetch, port: API_PORT, hostname: '127.0.0.1' });

  return async () => {
    server.close();
    await close().catch(() => undefined);
    await pg.stop().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  };
}
