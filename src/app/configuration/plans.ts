import type { PlanDefinition } from '@/models/billing';

/**
 * Catalogue des offres — SEULE source des tarifs affichés dans l'interface.
 * Les droits détaillés (blocs, thèmes, onglets d'apparence, statistiques) sont dans `models/access.ts` (`RIGHTS`) :
 * le serveur les applique, l'interface ne fait que les refléter.
 * Devise et montants sont des données : aucun composant ne les code en dur.
 */
export const PLANS: readonly PlanDefinition[] = [
  { id: 'free', highlighted: false, price: { monthly: 0, yearly: 0, currency: 'GNF' }, features: ['freeForever', 'links4', 'servicesContacts2', 'themes3', 'colors', 'qr'] },
  { id: 'basic', highlighted: false, price: { monthly: 10_000, yearly: 100_000, currency: 'GNF' }, features: ['trial15', 'everythingFree', 'links10', 'servicesContacts5', 'textBlock', 'themes6', 'tabsButtonsText', 'analyticsBasic', 'noBranding'] },
  { id: 'pro', highlighted: true, price: { monthly: 20_000, yearly: 200_000, currency: 'GNF' }, features: ['trial15', 'everythingBasic', 'unlimitedItems', 'allBlocks', 'allThemes', 'allTabs', 'analyticsFull'] },
  { id: 'business', highlighted: false, price: { monthly: 35_000, yearly: 350_000, currency: 'GNF' }, features: ['trial15', 'everythingPro', 'unlimitedAll', 'team', 'customDomain', 'dedicatedSupport'] },
];

export const getPlan = (id: string) => PLANS.find((p) => p.id === id) ?? PLANS[0]!;

type PlanKey = 'free' | 'basic' | 'pro' | 'business';

/** Valeurs de comparaison traduites (`billing.comparison.<jeton>`) : les autres chaînes (« 4 », « ∞ ») sont affichées telles quelles. */
export const COMPARISON_TOKENS = ['blocksEssential', 'blocksText', 'blocksAll', 'themes3', 'themes6', 'themesAll', 'tabs2', 'tabs4', 'tabsAll', 'analyticsNone', 'analyticsBasic', 'analyticsFull', 'community', 'priority', 'dedicated'] as const;

/** Matrice de comparaison : ligne → valeur par offre (bool = inclus ou non, string = valeur ou jeton). */
export const PLAN_COMPARISON: { key: string; values: Record<PlanKey, boolean | string> }[] = [
  { key: 'links', values: { free: '4', basic: '10', pro: '∞', business: '∞' } },
  { key: 'servicesContacts', values: { free: '2', basic: '5', pro: '∞', business: '∞' } },
  { key: 'blocks', values: { free: 'blocksEssential', basic: 'blocksText', pro: 'blocksAll', business: 'blocksAll' } },
  { key: 'themes', values: { free: 'themes3', basic: 'themes6', pro: 'themesAll', business: 'themesAll' } },
  { key: 'tabs', values: { free: 'tabs2', basic: 'tabs4', pro: 'tabsAll', business: 'tabsAll' } },
  { key: 'analytics', values: { free: 'analyticsNone', basic: 'analyticsBasic', pro: 'analyticsFull', business: 'analyticsFull' } },
  { key: 'qr', values: { free: true, basic: true, pro: true, business: true } },
  { key: 'badge', values: { free: false, basic: false, pro: 'Pro', business: 'Business' } },
  { key: 'noBranding', values: { free: false, basic: true, pro: true, business: true } },
  { key: 'team', values: { free: false, basic: false, pro: false, business: '5' } },
  { key: 'customDomain', values: { free: false, basic: false, pro: false, business: true } },
  { key: 'support', values: { free: 'community', basic: 'community', pro: 'priority', business: 'dedicated' } },
];
