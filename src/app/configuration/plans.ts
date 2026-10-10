import type { PlanDefinition } from '@/models/billing';

/**
 * Catalogue des offres — SEULE source des tarifs affichés dans l'interface.
 * Les montants ci-dessous sont des valeurs INDICATIVES de travail (à confirmer par le produit) ;
 * les droits réels sont déterminés par le backend (Session.entitlements).
 * Devise et montants sont des données : aucun composant ne les code en dur.
 */
export const PLANS: readonly PlanDefinition[] = [
  {
    id: 'free',
    highlighted: false,
    price: { monthly: 0, yearly: 0, currency: 'GNF' },
    limits: { maxBlocks: 10, analyticsDays: 7, teamSeats: 1 },
    features: ['page', 'blocks10', 'themes', 'qr', 'analyticsBasic', 'branding'],
  },
  {
    id: 'pro',
    highlighted: true,
    price: { monthly: 49_000, yearly: 490_000, currency: 'GNF' },
    limits: { maxBlocks: 50, analyticsDays: 90, teamSeats: 1 },
    features: ['everythingFree', 'blocks50', 'analytics90', 'noBranding', 'prioritySupport'],
  },
  {
    id: 'business',
    highlighted: false,
    price: { monthly: 149_000, yearly: 1_490_000, currency: 'GNF' },
    limits: { maxBlocks: null, analyticsDays: 365, teamSeats: 5 },
    features: ['everythingPro', 'blocksUnlimited', 'team', 'analytics365', 'customDomain', 'dedicatedSupport'],
  },
];

export const getPlan = (id: string) => PLANS.find((p) => p.id === id) ?? PLANS[0]!;

/** Matrice de comparaison : ligne → valeur par offre (bool = inclus ou non, string/number = valeur). */
export const PLAN_COMPARISON: { key: string; values: Record<'free' | 'pro' | 'business', boolean | string> }[] = [
  { key: 'blocks', values: { free: '10', pro: '50', business: '∞' } },
  { key: 'themes', values: { free: true, pro: true, business: true } },
  { key: 'qr', values: { free: true, pro: true, business: true } },
  { key: 'analyticsDays', values: { free: '7', pro: '90', business: '365' } },
  { key: 'noBranding', values: { free: false, pro: true, business: true } },
  { key: 'team', values: { free: false, pro: false, business: '5' } },
  { key: 'customDomain', values: { free: false, pro: false, business: true } },
  { key: 'support', values: { free: 'community', pro: 'priority', business: 'dedicated' } },
];
