/**
 * Accès du compte (essais, abonnement, verrouillage). Le calcul vit dans `src/models/access.ts` (partagé avec l'interface) ;
 * ce module l'applique à une ligne `users` + `subscriptions`. Le serveur est l'autorité : on ne se fie jamais à l'interface.
 */
import { and, eq } from 'drizzle-orm';
import type { Deps, UserRow } from '../context.js';
import { subscriptions, users } from '../db/schema.js';
import { DAY_MS, FREE_TRIAL_DAYS, RIGHTS, computeAccess, type AccessInfo, type PlanId, type PlanRights } from '../../src/models/access.js';
import { forbidden } from '../lib/errors.js';

export interface SubscriptionFacts { planId: string | null; status: string | null; trialEndsAt: Date | null; renewsAt: Date | null }

export function accessOf(user: Pick<UserRow, 'adminRole' | 'freeTrialEndsAt' | 'paidTrialUsedAt'>, sub: SubscriptionFacts | null, now: Date): AccessInfo {
  return computeAccess(
    {
      adminRole: user.adminRole,
      freeTrialEndsAt: user.freeTrialEndsAt,
      paidTrialUsedAt: user.paidTrialUsedAt,
      subscription: sub && sub.planId && sub.status ? { planId: sub.planId, status: sub.status, trialEndsAt: sub.trialEndsAt, renewsAt: sub.renewsAt } : null,
    },
    now,
  );
}

export const freeTrialEnd = (now: Date) => new Date(now.getTime() + FREE_TRIAL_DAYS * DAY_MS);

export const rightsOf = (plan: PlanId): PlanRights => RIGHTS[plan];

/** Lit l'accès COURANT d'un compte (hors requête authentifiée : tâches, administration). */
export async function accessForUser(deps: Deps, userId: string): Promise<AccessInfo> {
  const [row] = await deps.db
    .select({ u: users, planId: subscriptions.planId, status: subscriptions.status, trialEndsAt: subscriptions.trialEndsAt, renewsAt: subscriptions.renewsAt })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(and(eq(users.id, userId)))
    .limit(1);
  if (!row) return computeAccess({ adminRole: null, freeTrialEndsAt: null, paidTrialUsedAt: null, subscription: null }, deps.now());
  return accessOf(row.u, row, deps.now());
}

/** Refuse l'action quand l'essai est terminé : un abonnement est obligatoire pour continuer à utiliser 1Link. */
export function assertNotLocked(access: AccessInfo) {
  if (access.locked) throw forbidden('subscription_required');
}

/** Offre prise en compte pour les badges : l'équipe a un accès complet mais ne porte pas de badge d'abonné. */
export const badgePlanOf = (access: AccessInfo): PlanId => (access.phase === 'staff' ? 'free' : access.plan);
