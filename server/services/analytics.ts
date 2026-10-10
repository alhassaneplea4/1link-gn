/** Rapports d'audience (propriétaire d'une page) et indicateurs de plateforme (Admin Center), calculés en SQL. */
import { eq, sql, type SQL } from 'drizzle-orm';
import type { AuthContext, Deps } from '../context.js';
import type { Executor } from '../db/client.js';
import { pages } from '../db/schema.js';
import { entitlementsFor } from '../lib/access.js';
import { badRequest } from '../lib/errors.js';
import type { AnalyticsReport, DateRange, SeriesPoint, Share } from '../../src/models/analytics.js';
import type { PlatformOverview } from '../../src/models/admin.js';
import type { AnyBlock } from '../../src/models/blocks.js';

const DAY = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoDay(new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * DAY));
const spanDays = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY) + 1;

/** Valide et borne une période demandée. */
export function normalizeRange(range: DateRange, now: Date, maxDays: number): DateRange {
  if (!DAY_RE.test(range.from) || !DAY_RE.test(range.to) || Number.isNaN(Date.parse(range.from)) || Number.isNaN(Date.parse(range.to))) throw badRequest('invalid_range');
  const today = isoDay(now);
  let to = range.to > today ? today : range.to;
  let from = range.from;
  if (from > to) throw badRequest('invalid_range');
  const earliest = addDays(today, -(maxDays - 1));
  if (from < earliest) from = earliest;
  if (to < from) to = from;
  if (spanDays(from, to) > 366) from = addDays(to, -365);
  return { preset: range.preset, from, to };
}

const scope = (pageId: string | null): SQL => (pageId ? sql`page_id = ${pageId}` : sql`true`);
const win = (from: string, to: string): SQL => sql`at >= ${from}::date and at < (${to}::date + 1)`;

async function totals(db: Executor, pageId: string | null, from: string, to: string) {
  const r = await db.execute<{ views: number; visitors: number; clicks: number }>(sql`
    select count(*) filter (where kind = 'view')::int as views,
           count(distinct visitor) filter (where kind = 'view')::int as visitors,
           count(*) filter (where kind = 'click')::int as clicks
    from page_events where ${scope(pageId)} and ${win(from, to)}`);
  return r.rows[0] ?? { views: 0, visitors: 0, clicks: 0 };
}

async function series(db: Executor, pageId: string | null, from: string, to: string): Promise<SeriesPoint[]> {
  if (from === to) {
    const r = await db.execute<{ h: number; views: number; visitors: number; clicks: number }>(sql`
      select g.h::int as h, coalesce(v.views, 0)::int as views, coalesce(v.visitors, 0)::int as visitors, coalesce(v.clicks, 0)::int as clicks
      from generate_series(0, 23) as g(h)
      left join (
        select extract(hour from at at time zone 'UTC')::int as h,
               count(*) filter (where kind = 'view') as views, count(distinct visitor) filter (where kind = 'view') as visitors, count(*) filter (where kind = 'click') as clicks
        from page_events where ${scope(pageId)} and ${win(from, to)} group by 1) v on v.h = g.h
      order by g.h`);
    return r.rows.map((x) => ({ date: `${from}T${String(x.h).padStart(2, '0')}:00`, views: x.views, visitors: x.visitors, clicks: x.clicks }));
  }
  const r = await db.execute<{ date: string; views: number; visitors: number; clicks: number }>(sql`
    select to_char(d::date, 'YYYY-MM-DD') as date, coalesce(v.views, 0)::int as views, coalesce(v.visitors, 0)::int as visitors, coalesce(v.clicks, 0)::int as clicks
    from generate_series(${from}::date, ${to}::date, interval '1 day') as d
    left join (
      select (at at time zone 'UTC')::date as day,
             count(*) filter (where kind = 'view') as views, count(distinct visitor) filter (where kind = 'view') as visitors, count(*) filter (where kind = 'click') as clicks
      from page_events where ${scope(pageId)} and ${win(from, to)} group by 1) v on v.day = d::date
    order by d`);
  return r.rows;
}

const shares = async (db: Executor, pageId: string | null, from: string, to: string, column: 'source' | 'device' | 'country'): Promise<Share[]> => {
  const col = sql.raw(column);
  const r = await db.execute<{ name: string | null; value: number }>(sql`
    select ${col} as name, count(distinct visitor)::int as value from page_events
    where kind = 'view' and ${scope(pageId)} and ${win(from, to)} group by ${col} order by value desc limit 12`);
  return r.rows.map((x) => ({ name: x.name ?? '', value: x.value }));
};

const ratio = (cur: number, prev: number): number | null => (prev > 0 ? (cur - prev) / prev : null);

const KNOWN_SOURCES = new Set(['whatsapp', 'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'email', 'poster', 'card']);
const sourceKey = (raw: string) => (raw === '' ? 'direct' : KNOWN_SOURCES.has(raw) ? raw : 'other');

function mergeShares(items: Share[], key: (n: string) => string): Share[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i.name), (m.get(key(i.name)) ?? 0) + i.value);
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Libellé lisible d'un bloc (pour « liens les plus cliqués »). */
export function blockLabel(b: AnyBlock): string {
  const d = b.data as unknown as Record<string, unknown>;
  for (const k of ['title', 'label', 'name', 'displayName', 'fullName', 'email', 'phone', 'url', 'address']) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
  }
  const items = d.items;
  if (Array.isArray(items) && items.length) {
    const first = items[0] as Record<string, unknown>;
    for (const k of ['name', 'title', 'platform', 'value']) if (typeof first[k] === 'string' && first[k]) return `${first[k] as string}${items.length > 1 ? ` +${items.length - 1}` : ''}`;
  }
  return b.type;
}

export async function userReport(deps: Deps, auth: AuthContext, requested: DateRange, locale: string): Promise<AnalyticsReport> {
  const now = deps.now();
  const range = normalizeRange(requested, now, entitlementsFor(auth.planId).analyticsDays);
  const [page] = await deps.db.select({ id: pages.id, draft: pages.draft }).from(pages).where(eq(pages.userId, auth.user.id)).limit(1);
  const pageId = page?.id ?? '__none__';
  const len = spanDays(range.from, range.to);
  const prevTo = addDays(range.from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));

  const [cur, prev, points, sources, devices, countries, clicks] = await Promise.all([
    totals(deps.db, pageId, range.from, range.to),
    totals(deps.db, pageId, prevFrom, prevTo),
    series(deps.db, pageId, range.from, range.to),
    shares(deps.db, pageId, range.from, range.to, 'source'),
    shares(deps.db, pageId, range.from, range.to, 'device'),
    shares(deps.db, pageId, range.from, range.to, 'country'),
    deps.db.execute<{ block_id: string; clicks: number }>(sql`
      select block_id, count(*)::int as clicks from page_events
      where kind = 'click' and page_id = ${pageId} and ${win(range.from, range.to)} and block_id is not null group by block_id order by clicks desc limit 10`),
  ]);

  const labels = new Map((page?.draft.blocks ?? []).map((b) => [b.id, blockLabel(b)]));
  const names = (() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return null;
    }
  })();
  const unknown = locale.startsWith('en') ? 'Unknown' : 'Inconnu';
  const ctr = cur.views ? cur.clicks / cur.views : 0;
  const prevCtr = prev.views ? prev.clicks / prev.views : 0;

  return {
    range, geoApproximate: true,
    totals: { views: cur.views, visitors: cur.visitors, clicks: cur.clicks, ctr },
    deltas: { views: ratio(cur.views, prev.views), visitors: ratio(cur.visitors, prev.visitors), clicks: ratio(cur.clicks, prev.clicks), ctr: prev.views ? ratio(ctr, prevCtr) : null },
    series: points,
    topLinks: clicks.rows.map((r) => ({ blockId: r.block_id, label: labels.get(r.block_id) ?? '—', clicks: r.clicks, ctr: cur.views ? r.clicks / cur.views : 0 })),
    sources: mergeShares(sources, sourceKey),
    devices: mergeShares(devices, (n) => n || 'desktop'),
    countries: mergeShares(countries, (n) => (n ? (names?.of(n) ?? n) : unknown)),
  };
}

export async function platformOverview(deps: Deps, requested: Pick<DateRange, 'from' | 'to'>): Promise<PlatformOverview> {
  const now = deps.now();
  const range = normalizeRange({ preset: 'custom', ...requested }, now, 366);
  const nowTs = now;
  const one = async <T extends Record<string, unknown>>(q: SQL) => (await deps.db.execute<T>(q)).rows[0]!;
  const [counts, ev, signups, categories, plans, revenue, series_] = await Promise.all([
    one<{ users: number; active: number; fresh: number; published: number; subs: number; reports: number; errors: number }>(sql`
      select (select count(*) from users)::int as users,
             (select count(*) from users where last_active_at >= ${nowTs}::timestamptz - interval '30 days')::int as active,
             (select count(*) from users where created_at >= ${range.from}::date and created_at < (${range.to}::date + 1))::int as fresh,
             (select count(*) from pages where status = 'published')::int as published,
             (select count(*) from subscriptions where status in ('active', 'trialing') and plan_id <> 'free')::int as subs,
             (select count(*) from reports where status = 'open')::int as reports,
             (select count(*) from app_errors where at >= ${range.from}::date and at < (${range.to}::date + 1))::int as errors`),
    totals(deps.db, null, range.from, range.to),
    deps.db.execute<{ date: string; value: number }>(sql`
      select to_char(d::date, 'YYYY-MM-DD') as date, coalesce(s.n, 0)::int as value
      from generate_series(${range.from}::date, ${range.to}::date, interval '1 day') d
      left join (select (created_at at time zone 'UTC')::date as day, count(*) n from users where created_at >= ${range.from}::date and created_at < (${range.to}::date + 1) group by 1) s on s.day = d::date
      order by d`),
    deps.db.execute<{ name: string; value: number }>(sql`select coalesce(category, 'none') as name, count(*)::int as value from users group by 1 order by 2 desc`),
    deps.db.execute<{ name: string; value: number }>(sql`select plan_id as name, count(*)::int as value from subscriptions group by 1 order by 2 desc`),
    one<{ total: number }>(sql`select coalesce(sum(amount), 0)::int as total from payments where status = 'paid' and created_at >= ${range.from}::date and created_at < (${range.to}::date + 1)`),
    series(deps.db, null, range.from, range.to),
  ]);
  return {
    currency: 'GNF',
    kpis: {
      users: counts.users, activeUsers: counts.active, newAccounts: counts.fresh, publishedPages: counts.published, visits: ev.views, clicks: ev.clicks,
      subscriptions: counts.subs, revenue: revenue.total, reports: counts.reports, errors: counts.errors,
    },
    series: series_, signups: signups.rows, categories: categories.rows, plans: plans.rows,
  };
}
