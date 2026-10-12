/**
 * Données saisies pendant l'assistant de configuration.
 * Elles vivent en mémoire pendant la saisie et sont synchronisées avec le serveur (brouillon de l'assistant, lié au compte) :
 * un rechargement ou un autre appareil reprend là où l'utilisateur s'est arrêté, et rien n'est conservé dans le navigateur.
 */
import { create } from 'zustand';
import { isCategoryId, type CategoryId } from '@/models/category';
import { THEME_IDS, type ThemeId } from '@/models/appearance';
import { SOCIAL_PLATFORMS, type SocialPlatform } from '@/models/blocks';
import { registerReset } from '@/state/lifecycle';

export const STEPS = ['category', 'identity', 'activity', 'links', 'content', 'appearance', 'preview', 'publish'] as const;
export type StepId = (typeof STEPS)[number];

export interface OnboardingData {
  category: CategoryId | null;
  identity: { displayName: string; username: string; avatarUrl: string; coverUrl?: string };
  activity: Partial<Record<'headline' | 'bio' | 'location' | 'phone' | 'email' | 'sector', string>>;
  socials: { platform: SocialPlatform; url: string }[];
  links: { title: string; url: string }[];
  items: { name: string; description: string; price: string; imageUrl: string }[];
  about: string;
  themeId: ThemeId | null;
  primaryColor: string | null;
}

interface State extends OnboardingData {
  step: number;
  /** Étapes déjà validées au moins une fois (pour l'état « à compléter »). */
  visited: number;
  set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]): void;
  patch<K extends 'identity' | 'activity'>(key: K, value: Partial<OnboardingData[K]>): void;
  go(step: number): void;
  reset(): void;
}

const empty: OnboardingData = {
  category: null,
  identity: { displayName: '', username: '', avatarUrl: '', coverUrl: '' },
  activity: {},
  socials: [{ platform: 'instagram', url: 'https://instagram.com/' }],
  links: [{ title: '', url: '' }],
  items: [{ name: '', description: '', price: '', imageUrl: '' }],
  about: '',
  themeId: null,
  primaryColor: null,
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
  const { category, identity, activity, socials, links, items, about, themeId, primaryColor, step, visited } = s;
  return { category, identity, activity, socials, links, items, about, themeId, primaryColor, step, visited };
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const arr = <T,>(v: unknown, map: (x: Record<string, unknown>) => T, max: number): T[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, max).map(map) : [];

/** Réinjecte un brouillon reçu du serveur en le revalidant (une donnée corrompue ne doit jamais faire planter l'assistant). */
export function restoreOnboarding(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const r = raw as Record<string, unknown>;
  const identity = (r.identity ?? {}) as Record<string, unknown>;
  const activity = (r.activity ?? {}) as Record<string, unknown>;
  const keys = ['headline', 'bio', 'location', 'phone', 'email', 'sector'] as const;
  const restored: Partial<OnboardingData> & { step: number; visited: number } = {
    category: isCategoryId(r.category) ? r.category : null,
    identity: { displayName: str(identity.displayName, 120), username: str(identity.username, 40), avatarUrl: str(identity.avatarUrl, 2048), coverUrl: str(identity.coverUrl, 2048) },
    activity: Object.fromEntries(keys.filter((k) => typeof activity[k] === 'string').map((k) => [k, str(activity[k])])),
    socials: arr(r.socials, (x) => ({ platform: ((SOCIAL_PLATFORMS as readonly string[]).includes(x.platform as string) ? x.platform : 'instagram') as SocialPlatform, url: str(x.url, 2048) }), 12),
    links: arr(r.links, (x) => ({ title: str(x.title, 120), url: str(x.url, 2048) }), 12),
    items: arr(r.items, (x) => ({ name: str(x.name, 120), description: str(x.description, 300), price: str(x.price, 40), imageUrl: str(x.imageUrl, 2048) }), 24),
    about: str(r.about, 2000),
    themeId: (THEME_IDS as readonly string[]).includes(r.themeId as string) ? (r.themeId as ThemeId) : null,
    primaryColor: typeof r.primaryColor === 'string' && /^#[0-9a-f]{3,6}$/i.test(r.primaryColor) ? r.primaryColor : null,
    step: Math.min(STEPS.length - 1, Math.max(0, Number.isInteger(r.step) ? (r.step as number) : 0)),
    visited: Math.min(STEPS.length - 1, Math.max(0, Number.isInteger(r.visited) ? (r.visited as number) : 0)),
  };
  if (!restored.socials?.length) restored.socials = structuredClone(empty.socials);
  if (!restored.links?.length) restored.links = structuredClone(empty.links);
  if (!restored.items?.length) restored.items = structuredClone(empty.items);
  useOnboarding.setState(restored);
}
