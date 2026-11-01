/**
 * Pastilles des menus de navigation : ce qui attend une action, calculé en base à chaque demande (jamais mis en cache).
 * Seules les rubriques à compter côté serveur sont ici ; l'interface ajoute elle-même celles qui découlent de l'état local
 * (page non publiée, blocs incomplets, essai qui se termine…).
 */
import { sql } from 'drizzle-orm';
import type { AuthContext, Deps } from '../context.js';
import { permissionsFor } from '../lib/access.js';
import type { AdminSection } from '../../src/models/auth.js';

export type NavBadges = Record<string, number>;

const count = async (deps: Deps, query: ReturnType<typeof sql>): Promise<number> => {
  const res = await deps.db.execute<{ n: number }>(query);
  return Number(res.rows[0]?.n ?? 0);
};

/** Espace client : commandes de cartes qui demandent une action du client (paiement à faire, visuel refusé à corriger). */
export async function userBadges(deps: Deps, auth: AuthContext): Promise<NavBadges> {
  const cards = await count(
    deps,
    sql`select count(*)::int as n from card_orders
        where user_id = ${auth.user.id}
          and (status = 'awaiting_payment' or (status in ('paid', 'validating') and design_approved_at is null and design_note <> ''))`,
  );
  return { cards };
}

/** Admin Center : éléments à traiter par l'équipe, limités aux rubriques que le rôle peut lire. */
export async function adminBadges(deps: Deps, auth: AuthContext): Promise<NavBadges> {
  const allowed = new Set(permissionsFor(auth.user.adminRole as never));
  const can = (s: AdminSection) => allowed.has(`${s}:read`);
  const out: NavBadges = {};
  const jobs: Promise<void>[] = [];
  const set = (key: string, query: ReturnType<typeof sql>) => jobs.push(count(deps, query).then((n) => void (out[key] = n)));

  const openReports = sql`select count(*)::int as n from reports where status in ('open', 'in_review')`;
  if (can('reports')) set('reports', openReports);
  if (can('moderation')) {
    set('moderation', sql`select ((select count(*) from reports where status in ('open', 'in_review')) + (select count(*) from verifications where status = 'pending'))::int as n`);
  }
  if (can('support')) set('support', sql`select count(*)::int as n from support_tickets where status <> 'solved'`);
  if (can('payments')) set('payments', sql`select count(*)::int as n from payments where status = 'pending'`);
  // Cartes : paiement reçu à examiner, visuel à valider, contrôle final avant expédition.
  if (can('cards')) set('cards', sql`select count(*)::int as n from card_orders where status in ('paid', 'validating', 'quality_check')`);
  await Promise.all(jobs);
  return out;
}
