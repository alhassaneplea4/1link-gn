/**
 * `npm run dev` : PostgreSQL réel (embarqué, données conservées dans .data/), API et interface en une commande.
 * Aucun compte ni donnée n'est créé : la base démarre vide (voir `npm run admin -- create-admin`).
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createDb } from '../server/db/client.js';
import { runMigrations } from '../server/db/migrate.js';
import { createRuntimeApp } from '../server/runtime.js';
import { startLocalPostgres } from '../server/testing/local-postgres.js';

const API_PORT = Number(process.env.API_PORT ?? 8787);
const DB_PORT = Number(process.env.DEV_DB_PORT ?? 54329);
const external = process.env.DATABASE_URL;

let databaseUrl = external ?? '';
let stopDb = async () => {};
if (!external) {
  const pg = await startLocalPostgres({ dir: resolve('.data/postgres'), port: DB_PORT, persistent: true });
  await pg.createDatabase('onelink');
  databaseUrl = pg.url('onelink');
  stopDb = () => pg.stop();
  console.log(`[dev] PostgreSQL local prêt (port ${DB_PORT}, données dans .data/postgres)`);
}

const handle = createDb(databaseUrl, 2);
await runMigrations(handle.db);
await handle.close();

const { app } = await createRuntimeApp({
  ...process.env,
  DATABASE_URL: databaseUrl,
  APP_URL: process.env.APP_URL ?? 'http://localhost:5173',
  ENABLE_DEV_ROUTES: '1',
  NODE_ENV: 'development',
});
const server = serve({ fetch: app.fetch, port: API_PORT, hostname: '127.0.0.1' });
console.log(`[dev] API sur http://127.0.0.1:${API_PORT}/api (e-mails et codes OTP affichés ici, aucun envoi réel)`);

const vite = spawn('npx', ['vite', '--host', 'localhost'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
});

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  vite.kill();
  server.close();
  await stopDb().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
vite.on('exit', shutdown);
