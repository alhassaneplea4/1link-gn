/**
 * Harnais de test : l'application COMPLÈTE (routes, validation, SQL) sur une vraie base PostgreSQL jetable,
 * avec e-mail / SMS simulés et horloge contrôlable. Utilisé par les tests serveur, les tests d'interface (fetch redirigé
 * vers l'application) et les fixtures des tests e2e.
 */
import { randomBytes } from 'node:crypto';
import { createApp } from '../app.js';
import { loadConfig, type AppConfig } from '../config.js';
import type { Deps } from '../context.js';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createDevMailer, type DevMailer } from '../lib/mailer.js';
import { createDevOtpSender, type DevOtpSender } from '../lib/otp-sender.js';
import type { LocalPostgres } from './local-postgres.js';

export const TEMPLATE_DB = 'onelink_template';

/** (Re)crée la base modèle : migrations appliquées une seule fois, puis clonée pour chaque fichier de test. */
export async function prepareTemplate(adminUrl: string): Promise<void> {
  const { default: pg } = await import('pg');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists "${TEMPLATE_DB}" with (force)`);
  await admin.query(`create database "${TEMPLATE_DB}"`);
  await admin.end();
  const handle = createDb(adminUrl.replace(/\/postgres$/, `/${TEMPLATE_DB}`), 2);
  await runMigrations(handle.db);
  await handle.close();
}

/** Démarre PostgreSQL embarqué et prépare la base modèle. */
export async function startTestPostgres(dir: string): Promise<{ pg: LocalPostgres; adminUrl: string }> {
  const { startLocalPostgres } = await import('./local-postgres.js'); // chargé à la demande : inutile dans les tests d'interface
  const pg = await startLocalPostgres({ dir, fast: true, quiet: true });
  const adminUrl = pg.url('postgres');
  await prepareTemplate(adminUrl);
  return { pg, adminUrl };
}

/** Test config: peu coûteux (scrypt), dev providers, no hardening. */
export const testConfig = (databaseUrl: string, overrides: Partial<AppConfig> = {}): AppConfig =>
  loadConfig(
    { NODE_ENV: 'test', DATABASE_URL: databaseUrl, APP_SECRET: 'test-secret-test-secret-test-secret-0000', APP_URL: 'http://localhost:5173', ENABLE_DEV_ROUTES: '1' },
    overrides,
  );

/** Vide toutes les tables (isolation entre deux tests d'un même fichier). */
export async function resetData(db: Db): Promise<void> {
  const { sql } = await import('drizzle-orm');
  await db.execute(sql.raw('truncate table users, otp_codes, rate_limits, audit_logs, security_events, activity_events, app_errors, support_tickets, payments restart identity cascade'));
}

export interface Clock {
  current: Date;
  now(): Date;
  advance(ms: number): void;
}
export const createClock = (start = new Date()): Clock => {
  const clock: Clock = { current: start, now: () => new Date(clock.current), advance: (ms) => void (clock.current = new Date(clock.current.getTime() + ms)) };
  return clock;
};

export interface Reply<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

/** Client HTTP avec cookie de session (comme un navigateur). */
export class TestClient {
  private jar = new Map<string, string>();
  constructor(private readonly app: { fetch(req: Request): Response | Promise<Response> }, private readonly extra: Record<string, string> = {}) {}

  private capture(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const [name, ...rest] = pair!.split('=');
      const value = rest.join('=');
      const expired = attrs.some((a) => /max-age=0/i.test(a)) || attrs.some((a) => /expires=/i.test(a) && new Date(a.split('=')[1]!.trim()).getTime() < Date.now());
      if (!value || expired) this.jar.delete(name!.trim());
      else this.jar.set(name!.trim(), value);
    }
  }

  /** Fonction compatible `fetch` (cookies conservés) : redirige les appels du navigateur simulé vers l'application. */
  asFetch(): typeof fetch {
    return async (input, init) => {
      const req = new Request(input instanceof Request ? input : String(input instanceof URL ? input.href : input), { ...init, signal: undefined } as RequestInit);
      for (const [k, v] of Object.entries(this.extra)) if (!req.headers.has(k)) req.headers.set(k, v);
      if (this.cookie) req.headers.set('cookie', this.cookie);
      const res = await this.app.fetch(req);
      this.capture(res);
      return res;
    };
  }

  get cookie() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async send<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply<T>> {
    const h = new Headers({ ...this.extra, ...headers });
    if (this.cookie) h.set('cookie', this.cookie);
    if (body !== undefined && !(body instanceof FormData)) h.set('content-type', 'application/json');
    const res = await this.app.fetch(new Request(`http://localhost:5173${path}`, { method, headers: h, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) }));
    this.capture(res);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* corps non JSON (image, flux) */
    }
    return { status: res.status, body: parsed as T, headers: res.headers };
  }
  get = <T = any>(path: string, headers?: Record<string, string>) => this.send<T>('GET', path, undefined, headers);
  post = <T = any>(path: string, body?: unknown, headers?: Record<string, string>) => this.send<T>('POST', path, body ?? {}, headers);
  put = <T = any>(path: string, body?: unknown) => this.send<T>('PUT', path, body ?? {});
  patch = <T = any>(path: string, body?: unknown) => this.send<T>('PATCH', path, body ?? {});
  clearCookies() {
    this.jar.clear();
  }
}

export interface TestApp {
  deps: Deps;
  db: Db;
  mailer: DevMailer;
  otp: DevOtpSender;
  clock: Clock;
  fetch(req: Request): Response | Promise<Response>;
  /** Nouveau « navigateur » (cookies séparés). */
  client(headers?: Record<string, string>): TestClient;
  close(): Promise<void>;
}

/** Crée une base isolée à partir du modèle migré, et l'application branchée dessus. */
export async function createTestApp(opts: { adminUrl?: string; overrides?: Partial<AppConfig>; clock?: Clock } = {}): Promise<TestApp> {
  const adminUrl = opts.adminUrl ?? process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('TEST_DATABASE_ADMIN_URL absent : le globalSetup de test n’a pas démarré PostgreSQL.');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const { default: pg } = await import('pg');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database "${name}" template "${TEMPLATE_DB}"`);
  await admin.end();

  const url = adminUrl.replace(/\/postgres$/, `/${name}`);
  const handle = createDb(url, 6);
  const config = testConfig(url, opts.overrides);
  const mailer = createDevMailer();
  const otp = createDevOtpSender();
  const clock = opts.clock ?? createClock();
  const deps: Deps = { db: handle.db, config, mailer, otp, now: () => clock.now(), defer: (w) => void w.catch(() => undefined) };
  const app = createApp(deps);
  return {
    deps, db: handle.db, mailer, otp, clock, fetch: (req) => app.fetch(req),
    client: (headers) => new TestClient({ fetch: (r) => app.fetch(r) }, headers),
    async close() {
      await handle.close();
      const a = new pg.Client({ connectionString: adminUrl });
      await a.connect();
      await a.query(`drop database if exists "${name}" with (force)`).catch(() => undefined);
      await a.end();
    },
  };
}
