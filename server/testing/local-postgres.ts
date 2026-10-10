/**
 * PostgreSQL réel embarqué (binaires officiels) pour le développement local, les tests et les e2e :
 * mêmes sémantiques que Neon / Postgres managé, sans Docker ni installation. Jamais importé par le code de production.
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

export interface LocalPostgres {
  port: number;
  /** Chaîne de connexion vers une base de ce serveur. */
  url(database: string): string;
  createDatabase(name: string, template?: string): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  stop(): Promise<void>;
}

export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });

export interface StartOptions {
  dir: string;
  port?: number;
  /** Conserver les données à l'arrêt (développement) ou les effacer (tests). */
  persistent?: boolean;
  /** Désactive les écritures synchrones : beaucoup plus rapide, réservé aux données jetables. */
  fast?: boolean;
  quiet?: boolean;
}

const USER = 'postgres';
const PASSWORD = 'postgres';

export async function startLocalPostgres(opts: StartOptions): Promise<LocalPostgres> {
  const port = opts.port ?? (await freePort());
  const server = new EmbeddedPostgres({
    databaseDir: opts.dir, user: USER, password: PASSWORD, port, persistent: opts.persistent ?? false,
    postgresFlags: opts.fast ? ['-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off', '-c', 'max_connections=200'] : ['-c', 'max_connections=200'],
    onLog: () => undefined,
    onError: opts.quiet ? () => undefined : (m) => console.error('[postgres]', m),
  });
  if (!existsSync(join(opts.dir, 'PG_VERSION'))) await server.initialise();
  await server.start();

  const url = (database: string) => `postgres://${USER}:${PASSWORD}@127.0.0.1:${port}/${database}`;
  const admin = async <T>(fn: (c: pg.Client) => Promise<T>): Promise<T> => {
    const client = new pg.Client({ connectionString: url('postgres') });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  };
  const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

  return {
    port,
    url,
    async createDatabase(name, template) {
      await admin(async (c) => {
        const exists = await c.query('select 1 from pg_database where datname = $1', [name]);
        if (!exists.rowCount) await c.query(`create database ${ident(name)}${template ? ` template ${ident(template)}` : ''}`);
      });
    },
    async dropDatabase(name) {
      await admin((c) => c.query(`drop database if exists ${ident(name)} with (force)`));
    },
    stop: () => server.stop(),
  };
}
