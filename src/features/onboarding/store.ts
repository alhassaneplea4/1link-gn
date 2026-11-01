/**
 * Données saisies pendant l'assistant de configuration (trois étapes : lien 1Link, type de compte, puis profil).
 * Elles vivent en mémoire pendant la saisie et sont synchronisées avec le serveur (brouillon de l'assistant, lié au compte) :
 * un rechargement ou un autre appareil reprend là où l'utilisateur s'est arrêté, et rien n'est conservé dans le navigateur.
 */
import { create } from 'zustand';
import { isCategoryId, type CategoryId } from '@/models/category';
import { registerReset } from '@/state/lifecycle';
import { validateUsername } from '@/utilities/validation';

export const STEPS = ['link', 'category', 'profile'] as const;
export type StepId = (typeof STEPS)[number];

export interface OnboardingData {
  /** Adresse 1Link choisie en premier (vérifiée auprès du serveur avant de continuer). */
  username: string;
  category: CategoryId | null;
  /** Photo de profil, couverture et nom complet. */
  identity: { displayName: string; avatarUrl: string; coverUrl?: string };
  /** `headline` = titre (métier, rôle, accroche) ; `sector` = secteur d'activité. */
  activity: Partial<Record<'headline' | 'sector', string>>;
}

interface State extends OnboardingData {
  step: number;
  /** Étapes déjà atteintes (on ne saute pas en avant). */
  visited: number;
  set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]): void;
  patch<K extends 'identity' | 'activity'>(key: K, value: Partial<OnboardingData[K]>): void;
  go(step: number): void;
  reset(): void;
}

const empty: OnboardingData = {
  username: '',
  category: null,
  identity: { displayName: '', avatarUrl: '', coverUrl: '' },
  activity: {},
};

export const useOnboarding = create<State>()((set) => ({
  ...structuredClone(empty),
  step: 0,
  visited: 0,
  set: (key, value) => set({ [key]: value } as Partial<State>),
  patch: (key, value) => set((s) => ({ [key]: { ...s[key], ...value } }) as Partial<State>),
  go: (step) => set((s) => ({ step, visited: Math.max(s.visited, step) })),
  reset: () => set({ ...structuredClone(empty), step: 0, visited: 0 }),
}));

registerReset(() => useOnboarding.getState().reset());

/** Ce qui est envoyé au serveur (aucun secret : uniquement la saisie de l'assistant). */
export function snapshotOnboarding(s: State): Record<string, unknown> {
  const { username, category, identity, activity, step, visited } = s;
  return { username, category, identity, activity, step, visited };
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Réinjecte un brouillon reçu du serveur en le revalidant (une donnée corrompue — ou d'un ancien format — ne doit jamais faire planter l'assistant). */
export function restoreOnboarding(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const r = raw as Record<string, unknown>;
  const identity = (r.identity ?? {}) as Record<string, unknown>;
  const activity = (r.activity ?? {}) as Record<string, unknown>;
  // Un brouillon sans adresse (ancien format) reprend à la première étape : le lien se choisit toujours en premier.
  const username = typeof r.username === 'string' && !validateUsername(r.username) ? r.username : '';
  const restored: Partial<OnboardingData> & { step: number; visited: number } = {
    username,
    category: isCategoryId(r.category) ? r.category : null,
    identity: { displayName: str(identity.displayName, 120), avatarUrl: str(identity.avatarUrl, 2048), coverUrl: str(identity.coverUrl, 2048) },
    activity: {
      ...(typeof activity.headline === 'string' ? { headline: str(activity.headline, 90) } : {}),
      ...(typeof activity.sector === 'string' ? { sector: str(activity.sector, 60) } : {}),
    },
    step: username ? Math.min(STEPS.length - 1, Math.max(0, Number.isInteger(r.step) ? (r.step as number) : 0)) : 0,
    visited: username ? Math.min(STEPS.length - 1, Math.max(0, Number.isInteger(r.visited) ? (r.visited as number) : 0)) : 0,
  };
  useOnboarding.setState(restored);
}
