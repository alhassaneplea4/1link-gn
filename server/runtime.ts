/** Construction des dépendances réelles à partir de l'environnement (Vercel, serveur local). */
import { loadConfig } from './config.js';
import type { Deps } from './context.js';
import { createDb } from './db/client.js';
import { createMailer } from './lib/mailer.js';
import { createOtpSender } from './lib/otp-sender.js';
import { createApp } from './app.js';

export async function createRuntimeApp(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  const handle = createDb(config.databaseUrl, config.poolMax);

  let defer: Deps['defer'] = (work) => void work.catch(() => undefined);
  if (env.VERCEL) {
    // Sur Vercel : prolonge l'instance pour le travail différé et libère proprement les connexions inactives (Fluid compute).
    const fns = await import('@vercel/functions');
    defer = (work) => fns.waitUntil(work.catch(() => undefined));
    fns.attachDatabasePool(handle.pool);
  }

  const deps: Deps = { db: handle.db, config, mailer: createMailer(config), otp: createOtpSender(config), now: () => new Date(), defer };
  return { app: createApp(deps), deps, close: handle.close };
}
