import type { Invoice, Subscription } from '@/models/billing';
import { PLANS } from '@/app/configuration/plans';
import type { BillingApi } from '../types';
import { delay, readDb, writeDb } from './db';
import { requireDemoUser } from './auth';

const DEFAULT_FREE: Subscription = { planId: 'free', status: 'active', period: 'monthly', renewsAt: null, cancelAtPeriodEnd: false };

export const demoBilling: BillingApi = {
  async getSubscription() {
    const u = requireDemoUser();
    return delay(structuredClone(readDb().subscriptions[u.id] ?? { ...DEFAULT_FREE, planId: u.plan }));
  },

  async listInvoices() {
    const u = requireDemoUser();
    if (u.plan === 'free') return delay([] as Invoice[]);
    const plan = PLANS.find((p) => p.id === u.plan)!;
    const mk = (i: number, status: Invoice['status']): Invoice => ({
      id: `INV-${2026}${String(10 - i).padStart(2, '0')}-${u.id.slice(-3).toUpperCase()}`,
      date: new Date(Date.UTC(2026, 9 - i, 2)).toISOString(), amount: plan.price.monthly, currency: plan.price.currency, status, planId: plan.id,
    });
    return delay([mk(0, 'paid'), mk(1, 'paid'), mk(2, 'paid'), mk(3, 'refunded')]);
  },

  /** Les paiements ne sont pas connectés : aucune souscription n'est simulée comme réussie. */
  async changePlan() {
    requireDemoUser();
    return delay({ status: 'unavailable' as const, reason: 'payments_not_connected' as const }, 500);
  },

  async cancel() {
    const u = requireDemoUser();
    await delay(null, 400);
    writeDb((db) => {
      const s = db.subscriptions[u.id];
      if (s) s.cancelAtPeriodEnd = true;
    });
    return structuredClone(readDb().subscriptions[u.id] ?? DEFAULT_FREE);
  },

  async resume() {
    const u = requireDemoUser();
    await delay(null, 400);
    writeDb((db) => {
      const s = db.subscriptions[u.id];
      if (s) s.cancelAtPeriodEnd = false;
    });
    return structuredClone(readDb().subscriptions[u.id] ?? DEFAULT_FREE);
  },
};
