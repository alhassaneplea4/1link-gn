import { sql } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { tooMany } from './errors.js';
import { sha256 } from './crypto.js';

let scale = 1;
/** Réservé aux tests e2e (voir `rateLimitScale` dans la configuration). */
export const setRateLimitScale = (n: number) => void (scale = n);

export interface HitResult {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
}

/**
 * Limiteur à fenêtre fixe, ATOMIQUE (un seul INSERT … ON CONFLICT) et partagé par toutes les instances
 * serverless : un compteur en mémoire ne protégerait rien quand la plateforme multiplie les instances.
 * Les clés ne contiennent jamais d'adresse IP en clair (empreinte).
 */
export async function hit(db: Executor, key: string, limit: number, windowSec: number, now: Date): Promise<HitResult> {
  const res = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limits (key, count, window_start) values (${key}, 1, ${now})
    on conflict (key) do update set
      count = case when rate_limits.window_start <= ${now}::timestamptz - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start <= ${now}::timestamptz - make_interval(secs => ${windowSec}) then ${now}::timestamptz else rate_limits.window_start end
    returning count, window_start`);
  const row = res.rows[0]!;
  const elapsed = (now.getTime() - new Date(row.window_start).getTime()) / 1000;
  return { allowed: row.count <= limit * scale, count: row.count, retryAfterSec: Math.max(1, Math.ceil(windowSec - elapsed)) };
}

/** Comme `hit`, mais lève une 429 normalisée quand la limite est dépassée. */
export async function enforce(db: Executor, key: string, limit: number, windowSec: number, now: Date, message = 'rate_limited'): Promise<void> {
  const r = await hit(db, key, limit, windowSec, now);
  if (!r.allowed) throw tooMany(message, r.retryAfterSec);
}

export const keyFor = (scope: string, ...parts: string[]) => `${scope}:${sha256(parts.join('|')).slice(0, 32)}`;
