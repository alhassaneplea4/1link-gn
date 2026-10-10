import { useEffect, useSyncExternalStore } from 'react';
import type { Dict, MessageKey, NamespaceName } from './types';
import { safeStorage } from '@/utilities/storage';

export type Locale = 'fr' | 'en';
export const LOCALES: { id: Locale; label: string; intl: string }[] = [
  { id: 'fr', label: 'Français', intl: 'fr-FR' },
  { id: 'en', label: 'English', intl: 'en-GB' },
];
export const DEFAULT_LOCALE: Locale = 'fr';
const STORAGE_KEY = 'onelink.locale';

/**
 * Chargeurs de dictionnaires, par langue et par espace de noms.
 * Chaque espace est un chunk séparé : l'Admin Center n'alourdit pas le site public.
 * L'anglais est volontairement partiel : toute clé absente retombe sur le français.
 */
const loaders: Record<Locale, Partial<Record<NamespaceName, () => Promise<{ default: Dict }>>>> = {
  fr: {
    common: () => import('./fr/common'),
    marketing: () => import('./fr/marketing'),
    auth: () => import('./fr/auth'),
    onboarding: () => import('./fr/onboarding'),
    dashboard: () => import('./fr/dashboard'),
    editor: () => import('./fr/editor'),
    appearance: () => import('./fr/appearance'),
    analytics: () => import('./fr/analytics'),
    billing: () => import('./fr/billing'),
    admin: () => import('./fr/admin'),
    pub: () => import('./fr/pub'),
  },
  en: {
    common: () => import('./en/common'),
    marketing: () => import('./en/marketing'),
    auth: () => import('./en/auth'),
  },
};

interface State {
  locale: Locale;
  messages: Record<Locale, Partial<Record<NamespaceName, Dict>>>;
  version: number;
}

const initialLocale = (): Locale => {
  const stored = safeStorage.get(STORAGE_KEY);
  return stored === 'en' || stored === 'fr' ? stored : DEFAULT_LOCALE;
};

const state: State = { locale: initialLocale(), messages: { fr: {}, en: {} }, version: 0 };
const listeners = new Set<() => void>();
const emit = () => {
  state.version += 1;
  listeners.forEach((l) => l());
};
const pending = new Map<string, Promise<void>>();

export function loadNamespaces(namespaces: readonly NamespaceName[], locale: Locale = state.locale): Promise<void> {
  const tasks: Promise<void>[] = [];
  const targets: Locale[] = locale === 'fr' ? ['fr'] : ['fr', locale]; // le français sert de repli
  for (const loc of targets) {
    for (const ns of namespaces) {
      if (state.messages[loc][ns]) continue;
      const load = loaders[loc][ns];
      if (!load) continue;
      const key = `${loc}:${ns}`;
      let p = pending.get(key);
      if (!p) {
        p = load().then((mod) => {
          state.messages[loc][ns] = mod.default;
          pending.delete(key);
          emit();
        });
        pending.set(key, p);
      }
      tasks.push(p);
    }
  }
  return Promise.all(tasks).then(() => undefined);
}

export async function setLocale(locale: Locale) {
  const namespaces = Object.keys(state.messages.fr) as NamespaceName[];
  await loadNamespaces(namespaces, locale);
  state.locale = locale;
  safeStorage.set(STORAGE_KEY, locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  emit();
}

export const getLocale = () => state.locale;
export const intlLocale = () => LOCALES.find((l) => l.id === state.locale)?.intl ?? 'fr-FR';

function lookup(dict: Dict | undefined, path: string[]): string | undefined {
  let cur: Dict | string | undefined = dict;
  for (const part of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export type TParams = Record<string, string | number>;

/** Traduction hors React (services, utilitaires). Dans les composants, utiliser `useT`. */
export function translate(key: MessageKey, params?: TParams): string {
  const [ns, ...path] = key.split('.') as [NamespaceName, ...string[]];
  let template: string | undefined;
  if (params && typeof params.count === 'number') {
    const rule = new Intl.PluralRules(intlLocale()).select(params.count);
    const pluralPath = [...path.slice(0, -1), `${path[path.length - 1]}_${rule}`];
    template = lookup(state.messages[state.locale][ns], pluralPath) ?? lookup(state.messages.fr[ns], pluralPath);
  }
  template ??= lookup(state.messages[state.locale][ns], path) ?? lookup(state.messages.fr[ns], path);
  if (template === undefined) return path[path.length - 1] ?? key;
  return params ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : template;
}

/** Vrai si la clé existe (langue courante ou repli français). Utile pour les libellés facultatifs construits dynamiquement. */
export function hasMessage(key: string): boolean {
  const [ns, ...path] = key.split('.') as [NamespaceName, ...string[]];
  return lookup(state.messages[state.locale][ns], path) !== undefined || lookup(state.messages.fr[ns], path) !== undefined;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const getVersion = () => state.version;

/** Hook de traduction : charge les espaces demandés si nécessaire et se met à jour à la volée. */
export function useT(...namespaces: NamespaceName[]) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const key = namespaces.join('|');
  useEffect(() => {
    if (namespaces.length) void loadNamespaces(namespaces);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return translate;
}

export function useLocale() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return { locale: state.locale, setLocale, locales: LOCALES };
}

if (typeof document !== 'undefined') document.documentElement.lang = state.locale;
