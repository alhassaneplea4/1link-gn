import { describe, expect, it } from 'vitest';
import type { Dict } from './types';

/** Espaces de noms dont la version anglaise doit être COMPLÈTE (l'Admin Center, outil interne, reste en français). */
const COMPLETE = ['common', 'marketing', 'auth', 'pub', 'editor', 'billing', 'dashboard', 'onboarding', 'appearance', 'analytics'] as const;

const flatten = (d: Dict, prefix = ''): Record<string, string> =>
  Object.entries(d).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === 'string') acc[`${prefix}${k}`] = v;
    else Object.assign(acc, flatten(v, `${prefix}${k}.`));
    return acc;
  }, {});

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionnaires fr / en', () => {
  for (const ns of COMPLETE) {
    it(`« ${ns} » : l’anglais couvre toutes les clés du français, avec les mêmes variables`, async () => {
      const fr = flatten((await import(`./fr/${ns}.ts`)).default as Dict);
      const en = flatten((await import(`./en/${ns}.ts`)).default as Dict);
      const missing = Object.keys(fr).filter((k) => !(k in en));
      const extra = Object.keys(en).filter((k) => !(k in fr));
      const badVars = Object.keys(en).filter((k) => k in fr && placeholders(en[k]!).join() !== placeholders(fr[k]!).join());
      expect({ missing, extra, badVars }).toEqual({ missing: [], extra: [], badVars: [] });
    });
  }
});
