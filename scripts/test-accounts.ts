/**
 * Comptes de test (un par type de profil).
 *   npm run test-accounts -- remove     → supprime tous les comptes @comptes-test.invalid (jamais un administrateur)
 * La création se fait au déploiement (SEED_TEST_ACCOUNTS=1 avec ADMIN_SEED_PASSWORD) ou en local avec `npm run dev`.
 */
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db/client.js';
import { removeTestAccounts, seedTestAccounts } from '../server/services/test-accounts.js';

const command = process.argv[2];
const config = loadConfig({ ...process.env, APP_SECRET: process.env.APP_SECRET ?? 'cli-only-secret-not-used-0123456789abcdef' });
const handle = createDb(config.databaseUrl, 1);
try {
  if (command === 'remove') console.log(`${await removeTestAccounts(handle.db)} compte(s) de test supprimé(s).`);
  else if (command === 'create') {
    const password = process.env.TEST_ACCOUNTS_PASSWORD ?? '';
    if (password.length < 12) throw new Error('TEST_ACCOUNTS_PASSWORD (12 caractères minimum) est obligatoire.');
    for (const m of await seedTestAccounts(handle.db, password, config.scryptLog2N)) console.log(`${m.created ? 'créé   ' : 'existant'}  ${m.email}  →  /${m.username}  (${m.plan})`);
  } else throw new Error('commande inconnue (create | remove).');
} finally {
  await handle.close();
}
