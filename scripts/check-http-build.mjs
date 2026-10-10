// Vérifie qu'un build de production en mode HTTP n'embarque AUCUN adaptateur ni jeu de données de démonstration.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-http-check';
execSync(`npx vite build --outDir ${out}`, { stdio: 'ignore', env: { ...process.env, VITE_API_MODE: 'http' } });
const dir = join(out, 'assets');
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
const forbidden = ['@demo.1link', 'onelink.demo.db', 'DEMO_ROLE_PERMISSIONS', 'compte-suspendu', 'indisponible-demo'];
const leaks = [];
for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8');
  for (const needle of forbidden) if (src.includes(needle)) leaks.push(`${f}: ${needle}`);
}
rmSync(out, { recursive: true, force: true });
if (leaks.length) {
  console.error('Fuite de code de démonstration dans le build HTTP :\n' + leaks.join('\n'));
  process.exit(1);
}
console.log(`OK — build HTTP sans code de démonstration (${files.length} fichiers JS vérifiés).`);
