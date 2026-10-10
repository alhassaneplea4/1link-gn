/**
 * Données saisies pendant l'assistant de configuration. Persistées localement (brouillon de saisie, jamais de secret)
 * pour survivre à un rechargement ; vidées à la déconnexion et à la fin de l'assistant.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CategoryId } from '@/models/category';
import type { ThemeId } from '@/models/appearance';
import type { SocialPlatform } from '@/models/blocks';
import { registerReset } from '@/state/lifecycle';

export const STEPS = ['category', 'identity', 'activity', 'links', 'content', 'appearance', 'preview', 'publish'] as const;
export type StepId = (typeof STEPS)[number];

export interface OnboardingData {
  category: CategoryId | null;
  identity: { displayName: string; username: string; avatarUrl: string };
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
  identity: { displayName: '', username: '', avatarUrl: '' },
  activity: {},
  socials: [{ platform: 'instagram', url: '' }],
  links: [{ title: '', url: '' }],
  items: [{ name: '', description: '', price: '', imageUrl: '' }],
  about: '',
  themeId: null,
  primaryColor: null,
};

export const useOnboarding = create<State>()(
  persist(
    (set) => ({
      ...structuredClone(empty),
      step: 0,
      visited: 0,
      set: (key, value) => set({ [key]: value } as Partial<State>),
      patch: (key, value) => set((s) => ({ [key]: { ...s[key], ...value } }) as Partial<State>),
      go: (step) => set((s) => ({ step, visited: Math.max(s.visited, step) })),
      reset: () => set({ ...structuredClone(empty), step: 0, visited: 0 }),
    }),
    {
      name: 'onelink.onboarding.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ ...s, set: undefined, patch: undefined, go: undefined, reset: undefined }) as unknown as State,
    },
  ),
);

registerReset(() => useOnboarding.getState().reset());
