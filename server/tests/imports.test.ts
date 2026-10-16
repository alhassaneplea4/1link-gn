import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Vercel exécute le code serveur en ESM natif : un import relatif sans extension `.js` provoque ERR_MODULE_NOT_FOUND en
 * production alors que tout fonctionne en local. Ce test le détecte avant le déploiement (et `npm run verify:vercel` le prouve).
 */
const root = resolve(__dirname, '../..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

// Fichiers de `src/` que le serveur importe à l'exécution : doivent rester des feuilles (aucun import d'exécution).
const SHARED = ['models/auth', 'models/access', 'models/blocks', 'models/badges', 'models/appearance', 'models/themes', 'models/category', 'models/verification', 'utilities/validation', 'utilities/color', 'utilities/phone', 'utilities/tracking', 'app/configuration/plans'];

describe('compatibilité ESM / Vercel', () => {
  const files = [...walk(join(root, 'server')).filter((f) => !f.includes('tests') && !f.includes('testing')), ...walk(join(root, 'api'))];

  it('tous les imports relatifs du serveur portent l’extension .js', () => {
    const bad: string[] = [];
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'(\.[^']*)'/g)) {
        if (!m[1]!.endsWith('.js') && !m[1]!.endsWith('.json')) bad.push(`${file.replace(root, '')} → ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('n’utilise jamais l’alias @/ (non résolu par Vercel) dans le code exécuté', () => {
    const bad = files.filter((f) => /from\s+'@\//.test(readFileSync(f, 'utf8').replace(/import type[^;]*;/g, '')));
    expect(bad.map((f) => f.replace(root, ''))).toEqual([]);
  });

  it('les modules partagés de src/ sont des feuilles (aucun import d’exécution)', () => {
    const leaks: string[] = [];
    for (const name of SHARED) {
      const source = readFileSync(join(root, 'src', `${name}.ts`), 'utf8');
      for (const m of source.matchAll(/(?:^|\n)\s*import\s+(?!type\b)[^;]*?from\s+'([^']+)'/g)) leaks.push(`${name} → ${m[1]}`);
    }
    expect(leaks).toEqual([]);
  });

  it('les migrations versionnées existent pour le schéma', () => {
    const sql = readdirSync(join(root, 'drizzle')).filter((f) => f.endsWith('.sql'));
    expect(sql.length).toBeGreaterThan(0);
  });
});
