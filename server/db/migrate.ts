import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client.js';

/** Applique les migrations SQL versionnées de `drizzle/`. Idempotent : seules les migrations manquantes sont exécutées. */
export async function runMigrations(db: Db, folder = resolve(process.cwd(), 'drizzle')): Promise<void> {
  await migrate(db, { migrationsFolder: folder });
}
