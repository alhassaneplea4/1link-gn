/**
 * Offres et essais. AUCUN paiement n'est traité par la plateforme :
 *  - souscrire une offre payante ouvre UNE SEULE FOIS un essai de 15 jours, sans paiement ;
 *  - ensuite, l'abonnement est activé par l'équipe après réception d'un paiement (Mobile Money, virement) ;
 *  - l'abonnement ne compte qu'après les 15 jours d'essai (`renewsAt` démarre à la fin de l'essai).
 */
import { eq } from 'drizzle-orm';
import type { AuthContext, C, Deps } from '../context.js';
import { payments, subscriptions, users } from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { newId } from '../lib/crypto.js';
import { badRequest, conflict, HttpError } from '../lib/errors.js';
import { DAY_MS, PAID_PLAN_IDS, PAID_TRIAL_DAYS, type PlanId } from '../../src/models/access.js';
import { getPlan } from '../../src/app/configuration/plans.js';
import type { BillingPeriod, ChangePlanResult, Subscription } from '../../src/models/billing.js';

export const toSubscription = (s: typeof subscriptions.$inferSelect | undefined): Subscription =>
  s
    ? { planId: s.planId as PlanId, status: s.status as Subscription['status'], period: s.period as Subscription['period'], renewsAt: s.renewsAt?.toISOString() ?? null, trialEndsAt: s.trialEndsAt?.toISOString() ?? null, cancelAtPeriodEnd: s.cancelAtPeriodEnd }
    : { planId: 'free', status: 'active', period: 'monthly', renewsAt: null, trialEndsAt: null, cancelAtPeriodEnd: false };

export async function subscriptionOf(deps: Deps, userId: string): Promise<Subscription> {
  const [s] = await deps.db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return toSubscription(s);
}

const addPeriod = (from: Date, period: BillingPeriod) => {
  const d = new Date(from);
  if (period === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
};

/** Demande de souscription par l'utilisateur : démarre l'essai de 15 jours s'il est encore disponible, sinon indique la marche à suivre. */
export async function requestPlan(deps: Deps, auth: AuthContext, planId: PlanId, period: BillingPeriod): Promise<ChangePlanResult> {
  const now = deps.now();
  if (!PAID_PLAN_IDS.includes(planId)) throw badRequest('invalid_plan', { planId: 'invalid' });
  const current = await subscriptionOf(deps, auth.user.id);
  const paying = current.status === 'active' && current.planId !== 'free' && (!current.renewsAt || new Date(current.renewsAt) > now);
  if (auth.access.phase === 'staff') throw conflict('staff_account');

  // Essai déjà en cours : changer d'offre pendant l'essai ne le prolonge pas.
  if (current.status === 'trialing' && current.trialEndsAt && new Date(current.trialEndsAt) > now) {
    await deps.db.update(subscriptions).set({ planId, period, updatedAt: now }).where(eq(subscriptions.userId, auth.user.id));
    return { status: 'changed', subscription: await subscriptionOf(deps, auth.user.id) };
  }
  // Abonnement payé en cours : tout changement passe par l'équipe (aucune passerelle de paiement).
  if (paying) return { status: 'unavailable', reason: 'payments_not_connected' };
  // Essai de 15 jours : une seule fois par compte.
  if (!auth.user.paidTrialUsedAt) {
    const trialEndsAt = new Date(now.getTime() + PAID_TRIAL_DAYS * DAY_MS);
    await deps.db.transaction(async (tx) => {
      await tx.update(users).set({ paidTrialUsedAt: now, updatedAt: now }).where(eq(users.id, auth.user.id));
      await tx
        .insert(subscriptions)
        .values({ id: newId('sub'), userId: auth.user.id, planId, status: 'trialing', period, trialEndsAt, renewsAt: null, startedAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: subscriptions.userId, set: { planId, status: 'trialing', period, trialEndsAt, renewsAt: null, cancelAtPeriodEnd: false, startedAt: now, updatedAt: now } });
    });
    return { status: 'changed', subscription: await subscriptionOf(deps, auth.user.id) };
  }
  // Essai déjà consommé : le paiement est confirmé par l'équipe 1Link.
  return { status: 'unavailable', reason: 'payments_not_connected' };
}

export interface ActivateInput { planId: PlanId; period: BillingPeriod; method: 'mobile_money' | 'card' | 'bank'; reference: string }

/** Activation par l'équipe après réception d'un paiement : l'abonnement court à partir de la fin de l'essai (ou de maintenant). */
export async function activateSubscription(c: C, deps: Deps, actor: AuthContext, userId: string, input: ActivateInput): Promise<Subscription> {
  if (!PAID_PLAN_IDS.includes(input.planId)) throw badRequest('invalid_plan', { planId: 'invalid' });
  const [target] = await deps.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new HttpError(404, 'not_found');
  const now = deps.now();
  const [existing] = await deps.db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const trialEnd = existing?.status === 'trialing' && existing.trialEndsAt && existing.trialEndsAt > now ? existing.trialEndsAt : null;
  const renewsAt = addPeriod(trialEnd ?? now, input.period);
  const plan = getPlan(input.planId);
  const amount = input.period === 'yearly' ? plan.price.yearly : plan.price.monthly;
  await deps.db.transaction(async (tx) => {
    await tx
      .insert(subscriptions)
      .values({ id: newId('sub'), userId, planId: input.planId, status: 'active', period: input.period, renewsAt, trialEndsAt: null, startedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: subscriptions.userId, set: { planId: input.planId, status: 'active', period: input.period, renewsAt, trialEndsAt: null, cancelAtPeriodEnd: false, updatedAt: now } });
    await tx.insert(payments).values({ id: newId('pay'), userId, planId: input.planId, amount, currency: plan.price.currency, status: 'paid', method: input.method, provider: 'manual', providerRef: input.reference.trim().slice(0, 80) || newId('ref') });
    await audit(tx, { actorId: actor.user.id, actorLabel: actor.user.name, action: `Abonnement ${input.planId} activé`, target: target.email ?? target.phone ?? userId, ip: c.get('ip') }, now);
  });
  return subscriptionOf(deps, userId);
}
