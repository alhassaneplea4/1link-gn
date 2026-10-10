import pg from 'pg';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
/** Accepte indifféremment la connexion ou une transaction : les services ne savent pas dans quel contexte ils s'exécutent. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

/**
 * Pool de connexions PostgreSQL (compatible Neon, Supabase, RDS, Postgres local).
 * En serverless, garder `max` petit et utiliser l'adresse « pooled » du fournisseur (PgBouncer).
 */
export function createDb(connectionString: string, max = 5): DbHandle {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 15_000,
    application_name: '1link-api',
  });
  // Une connexion inactive coupée par le serveur ne doit pas faire tomber le processus.
  pool.on('error', (err) => console.error('[db] erreur de connexion inactive :', err.message));
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

export { schema };
