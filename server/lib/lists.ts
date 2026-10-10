/**
 * Listes paginées de l'Admin Center : recherche, filtres, tri et pagination exécutés par la base.
 * Tout ce qui vient de l'URL est mappé sur une liste BLANCHE de fragments SQL : aucune colonne ni direction
 * fournie par le client n'est jamais interpolée, les valeurs sont toujours des paramètres liés.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { C } from '../context.js';
import type { Executor } from '../db/client.js';
import type { ListQuery, Paged } from '../../src/models/api.js';
import { intParam } from './request.js';

export interface ListSpec {
  from: SQL;
  select: SQL;
  searchColumns: SQL[];
  filters: Record<string, SQL>;
  sorts: Record<string, SQL>;
  defaultSort: string;
  defaultDir?: 'asc' | 'desc';
  /** Départage les égalités (pagination stable). */
  tiebreak: SQL;
  /** Condition fixe appliquée à toutes les requêtes. */
  baseWhere?: SQL;
}

const RESERVED = new Set(['page', 'pageSize', 'search', 'sort', 'dir']);

export function parseListQuery(c: C): ListQuery {
  const url = new URL(c.req.url);
  const filters: Record<string, string> = {};
  for (const [k, v] of url.searchParams) if (!RESERVED.has(k) && v && v !== 'all' && k.length <= 40 && v.length <= 80) filters[k] = v;
  const dir = url.searchParams.get('dir');
  return {
    page: intParam(url.searchParams.get('page') ?? undefined, 1, 1, 100_000),
    pageSize: intParam(url.searchParams.get('pageSize') ?? undefined, 20, 1, 100),
    search: url.searchParams.get('search')?.slice(0, 100) || undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    dir: dir === 'desc' ? 'desc' : dir === 'asc' ? 'asc' : undefined,
    filters,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function runList<R>(db: Executor, spec: ListSpec, q: ListQuery): Promise<Paged<R> & { rows: R[] }> {
  const where: SQL[] = [spec.baseWhere ?? sql`true`];
  const term = q.search?.trim();
  if (term && spec.searchColumns.length) {
    const pattern = `%${escapeLike(term)}%`;
    where.push(sql`(${sql.join(spec.searchColumns.map((col) => sql`${col}::text ilike ${pattern}`), sql` or `)})`);
  }
  for (const [key, value] of Object.entries(q.filters ?? {})) {
    const expr = spec.filters[key];
    if (expr) where.push(sql`${expr}::text = ${value}`);
  }
  const whereSql = sql.join(where, sql` and `);
  const dir = q.dir ?? spec.defaultDir ?? 'asc';
  const sortExpr = (q.sort && spec.sorts[q.sort]) || spec.sorts[spec.defaultSort]!;
  const order = sql`${sortExpr} ${sql.raw(dir === 'desc' ? 'desc' : 'asc')} nulls last, ${spec.tiebreak} asc`;
  const offset = (q.page - 1) * q.pageSize;

  const [total, rows] = await Promise.all([
    db.execute<{ n: number }>(sql`select count(*)::int as n from ${spec.from} where ${whereSql}`),
    db.execute<R & Record<string, unknown>>(sql`select ${spec.select} from ${spec.from} where ${whereSql} order by ${order} limit ${q.pageSize} offset ${offset}`),
  ]);
  return { items: [], rows: rows.rows as R[], total: total.rows[0]?.n ?? 0, page: q.page, pageSize: q.pageSize };
}
