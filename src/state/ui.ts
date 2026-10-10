import { create } from 'zustand';
import { safeStorage } from '@/utilities/storage';

export type ThemePreference = 'light' | 'dark' | 'system';
const KEY = 'onelink.theme';

const stored = (): ThemePreference => {
  const v = safeStorage.get(KEY);
  return v === 'dark' || v === 'light' ? v : 'system';
};

const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** Applique le thème sombre sur <html>. Réservé aux espaces connectés (dashboard, admin). */
export function applyAppTheme(pref: ThemePreference, enabled: boolean) {
  const dark = enabled && (pref === 'dark' || (pref === 'system' && systemDark()));
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

interface UiState {
  theme: ThemePreference;
  setTheme(t: ThemePreference): void;
}

export const useUi = create<UiState>((set) => ({
  theme: stored(),
  setTheme: (theme) => {
    safeStorage.set(KEY, theme);
    set({ theme });
  },
}));
