import type { PlanId } from './auth';

export type BillingPeriod = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'pending';
export type InvoiceStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface PlanDefinition {
  id: PlanId;
  highlighted: boolean;
  price: { monthly: number; yearly: number; currency: string };
  limits: { maxBlocks: number | null; analyticsDays: number; teamSeats: number };
  /** Clés (billing.features.*) des fonctionnalités incluses. */
  features: string[];
}

export interface Subscription {
  planId: PlanId;
  status: SubscriptionStatus;
  period: BillingPeriod;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  planId: PlanId;
}

/** Réponse à une demande de changement de plan : le front ne présume jamais d'un paiement réussi. */
export type ChangePlanResult =
  | { status: 'checkout_required'; checkoutUrl: string }
  | { status: 'changed'; subscription: Subscription }
  | { status: 'unavailable'; reason: 'payments_not_connected' };
