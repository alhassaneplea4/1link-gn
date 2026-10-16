/**
 * Offres, droits et essais de 1Link. SOURCE UNIQUE partagée par le serveur (qui fait autorité) et l'interface (qui ne fait que refléter).
 * Module partagé avec le serveur : doit rester une feuille (aucun import d'exécution).
 *
 * Offres : Free · Basique · Pro · Business.
 *  - Free = essai gratuit de 7 jours, une seule fois, à l'inscription ; ensuite un abonnement est obligatoire pour continuer.
 *  - Souscrire une offre payante donne un essai de 15 jours, une seule fois ; l'abonnement ne compte qu'après ces 15 jours.
 */
export type PlanId = 'free' | 'basic' | 'pro' | 'business';
export const PLAN_IDS: readonly PlanId[] = ['free', 'basic', 'pro', 'business'];
export const PAID_PLAN_IDS: readonly PlanId[] = ['basic', 'pro', 'business'];

export const FREE_TRIAL_DAYS = 7;
export const PAID_TRIAL_DAYS = 15;
export const DAY_MS = 86_400_000;

export type AppearanceTab = 'themes' | 'colors' | 'buttons' | 'text' | 'layout' | 'background';
export const APPEARANCE_TABS: readonly AppearanceTab[] = ['themes', 'colors', 'buttons', 'text', 'layout', 'background'];
export type AnalyticsPreset = 'today' | '7d' | '30d' | '90d' | 'custom';

/** Droits d'une offre. `null` = illimité ; `'all'` = tout. */
export interface PlanRights {
  blockTypes: readonly string[] | 'all';
  /** Nombre de blocs « Lien ». */
  maxLinks: number | null;
  /** Nombre de services dans le bloc « Services ». */
  maxServices: number | null;
  /** Nombre de contacts dans le bloc « Contacts ». */
  maxContacts: number | null;
  themes: readonly string[] | 'all';
  tabs: readonly AppearanceTab[];
  /** `null` = pas d'accès aux statistiques. */
  analytics: { presets: readonly AnalyticsPreset[]; breakdowns: boolean; maxDays: number } | null;
  /** Plafond du nombre total de blocs (protège la base). */
  maxBlocks: number;
  removeBranding: boolean;
  teamSeats: number;
}

const BASE_BLOCKS = ['profile', 'link', 'social', 'service', 'contact'] as const;
/** « custom » = thème personnalisé par les couleurs : toujours permis (l'onglet Couleurs est ouvert à toutes les offres). */
const FREE_THEMES = ['minimal', 'modern', 'dark', 'custom'] as const;
const BASIC_THEMES = [...FREE_THEMES, 'professional', 'creator', 'elegant'] as const;

export const RIGHTS: Record<PlanId, PlanRights> = {
  free: { blockTypes: BASE_BLOCKS, maxLinks: 4, maxServices: 2, maxContacts: 2, themes: FREE_THEMES, tabs: ['themes', 'colors'], analytics: null, maxBlocks: 12, removeBranding: false, teamSeats: 1 },
  basic: {
    blockTypes: [...BASE_BLOCKS, 'text'], maxLinks: 10, maxServices: 5, maxContacts: 5, themes: BASIC_THEMES, tabs: ['themes', 'colors', 'buttons', 'text'],
    analytics: { presets: ['today', '7d'], breakdowns: false, maxDays: 7 }, maxBlocks: 30, removeBranding: true, teamSeats: 1,
  },
  pro: {
    blockTypes: 'all', maxLinks: null, maxServices: null, maxContacts: null, themes: 'all', tabs: APPEARANCE_TABS,
    analytics: { presets: ['today', '7d', '30d', '90d', 'custom'], breakdowns: true, maxDays: 90 }, maxBlocks: 500, removeBranding: true, teamSeats: 1,
  },
  business: {
    blockTypes: 'all', maxLinks: null, maxServices: null, maxContacts: null, themes: 'all', tabs: APPEARANCE_TABS,
    analytics: { presets: ['today', '7d', '30d', '90d', 'custom'], breakdowns: true, maxDays: 365 }, maxBlocks: 500, removeBranding: true, teamSeats: 5,
  },
};

/** Tout ce qui n'est pas à 100 % plus restrictif qu'avant : l'offre minimale requise pour un droit. */
export const minimumPlanFor = (test: (r: PlanRights) => boolean): PlanId => PLAN_IDS.find((p) => test(RIGHTS[p])) ?? 'business';
export const allowsBlock = (r: PlanRights, type: string) => r.blockTypes === 'all' || r.blockTypes.includes(type);
export const allowsTheme = (r: PlanRights, theme: string) => r.themes === 'all' || r.themes.includes(theme);

export type AccessPhase = 'free_trial' | 'paid_trial' | 'subscribed' | 'expired' | 'staff';

export interface AccessInfo {
  phase: AccessPhase;
  /** Offre EFFECTIVE (celle dont les droits s'appliquent). `expired` : Free, mais compte verrouillé. */
  plan: PlanId;
  /** Fin de l'essai en cours (gratuit ou d'abonnement), le cas échéant. */
  trialEndsAt: string | null;
  daysLeft: number | null;
  /** Le compte est verrouillé : un abonnement est obligatoire pour continuer. */
  locked: boolean;
  /** L'essai de 15 jours d'une offre payante est encore disponible (une seule fois). */
  paidTrialAvailable: boolean;
}

export interface AccessInput {
  adminRole: string | null;
  freeTrialEndsAt: Date | string | null;
  paidTrialUsedAt: Date | string | null;
  subscription: { planId: string; status: string; trialEndsAt: Date | string | null; renewsAt: Date | string | null } | null;
}

const ms = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : null);
const daysLeft = (end: number, now: number) => Math.max(0, Math.ceil((end - now) / DAY_MS));

/**
 * Détermine l'accès du compte à l'instant `now` :
 *  - équipe d'administration : toujours l'accès complet ;
 *  - abonnement payant en essai (15 j) ou payé et en cours : les droits de l'offre ;
 *  - sinon l'essai gratuit de 7 jours (droits Free) ;
 *  - sinon le compte est verrouillé jusqu'à la souscription d'une offre.
 */
export function computeAccess(i: AccessInput, now: Date): AccessInfo {
  const t = now.getTime();
  const paidTrialAvailable = !i.paidTrialUsedAt;
  if (i.adminRole) return { phase: 'staff', plan: 'business', trialEndsAt: null, daysLeft: null, locked: false, paidTrialAvailable };
  const sub = i.subscription;
  const plan = (sub?.planId ?? 'free') as PlanId;
  if (sub && plan !== 'free') {
    const trialEnd = ms(sub.trialEndsAt);
    const renews = ms(sub.renewsAt);
    if (sub.status === 'trialing' && trialEnd !== null && trialEnd > t) return { phase: 'paid_trial', plan, trialEndsAt: new Date(trialEnd).toISOString(), daysLeft: daysLeft(trialEnd, t), locked: false, paidTrialAvailable };
    if (sub.status === 'active' && (renews === null || renews > t)) return { phase: 'subscribed', plan, trialEndsAt: null, daysLeft: null, locked: false, paidTrialAvailable };
  }
  const freeEnd = ms(i.freeTrialEndsAt);
  if (freeEnd !== null && freeEnd > t) return { phase: 'free_trial', plan: 'free', trialEndsAt: new Date(freeEnd).toISOString(), daysLeft: daysLeft(freeEnd, t), locked: false, paidTrialAvailable };
  return { phase: 'expired', plan: 'free', trialEndsAt: null, daysLeft: 0, locked: true, paidTrialAvailable };
}

/** Types de blocs qu'on peut ajouter plusieurs fois (les liens sont limités par l'offre) ; tous les autres sont uniques dans une page. */
export const MULTI_BLOCKS: readonly string[] = ['link', 'divider'];

/** Pourquoi un type de bloc ne peut pas être ajouté, compte tenu des blocs déjà présents (`null` = permis). */
export function addBlockProblem(rights: PlanRights, blocks: readonly { type: string }[], type: string): 'singleton' | 'plan_block' | 'plan_links' | 'plan_limit' | null {
  if (!MULTI_BLOCKS.includes(type) && blocks.some((b) => b.type === type)) return 'singleton';
  if (!allowsBlock(rights, type)) return 'plan_block';
  if (type === 'link' && rights.maxLinks !== null && blocks.filter((b) => b.type === 'link').length >= rights.maxLinks) return 'plan_links';
  if (blocks.length >= rights.maxBlocks) return 'plan_limit';
  return null;
}
