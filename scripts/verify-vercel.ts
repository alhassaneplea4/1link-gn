/**
 * Vérifie, SANS déployer, que la fonction Vercel démarre telle que Vercel l'exécutera :
 *   1. compile api/ et server/ fichier par fichier (comme le builder @vercel/node) dans .verify-out/ ;
 *   2. les importe avec le chargeur ESM natif de Node (les imports relatifs sans extension .js y échouent) ;
 *   3. démarre l'application sur un vrai PostgreSQL jetable et interroge /api/health puis une route métier.
 *   npm run verify:vercel
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareTemplate, TEMPLATE_DB } from '../server/testing/harness.js';
import { startLocalPostgres } from '../server/testing/local-postgres.js';

const out = resolve('.verify-out');
rmSync(out, { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.verify.json'], { stdio: 'inherit' });

const dir = mkdtempSync(join(tmpdir(), 'onelink-verify-'));
const pg = await startLocalPostgres({ dir, fast: true, quiet: true });
try {
  await prepareTemplate(pg.url('postgres'));
  Object.assign(process.env, {
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    VERCEL: '1',
    DATABASE_URL: pg.url(TEMPLATE_DB),
    APP_SECRET: 'verify-vercel-secret-verify-vercel-secret',
    APP_URL: 'https://preview.example.test',
    MAIL_PROVIDER: 'none',
    OTP_PROVIDER: 'none',
  });
  const entry = pathToFileURL(join(out, 'api', 'index.js')).href;
  const mod = (await import(entry)) as { default: { fetch(r: Request): Promise<Response> } };
  const health = await mod.default.fetch(new Request('https://preview.example.test/api/health'));
  const body = (await health.json()) as { status?: string };
  if (health.status !== 200 || body.status !== 'ok') throw new Error(`/api/health : ${health.status} ${JSON.stringify(body)}`);
  const session = await mod.default.fetch(new Request('https://preview.example.test/api/auth/session'));
  if (session.status !== 200 || (await session.json()) !== null) throw new Error('/api/auth/session devrait répondre 200 null pour un anonyme');
  const csrf = await mod.default.fetch(new Request('https://preview.example.test/api/auth/sign-in', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }));
  if (csrf.status !== 403) throw new Error(`l'origine étrangère devrait être refusée (403), reçu ${csrf.status}`);
  console.log('OK — la fonction démarre en ESM natif en configuration de production (health, session anonyme, garde CSRF).');
} finally {
  await pg.stop().catch(() => undefined);
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
}
process.exit(0);
