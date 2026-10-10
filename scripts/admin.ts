/**
 * Administration en ligne de commande (seul moyen de créer le PREMIER administrateur : aucune donnée n'est préinstallée).
 *   npm run admin -- create-admin --email vous@exemple.com --name "Votre Nom" [--role super_admin]
 *   npm run admin -- set-plan --email client@exemple.com --plan pro
 *   npm run admin -- set-role --email x@exemple.com --role moderator|none
 * Le mot de passe est lu dans ADMIN_PASSWORD, sinon généré et affiché une seule fois.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db/client.js';
import { subscriptions, users } from '../server/db/schema.js';
import { hashPassword, newId } from '../server/lib/crypto.js';
import { audit } from '../server/lib/audit.js';
import { ADMIN_ROLES } from '../src/models/auth.js';

const [command, ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const fail = (msg: string): never => {
  console.error(`Erreur : ${msg}`);
  process.exit(1);
};

const config = loadConfig({ ...process.env, APP_SECRET: process.env.APP_SECRET ?? 'cli-only-secret-not-used-0123456789abcdef' });
const handle = createDb(config.databaseUrl, 1);
const { db } = handle;
const now = new Date();
const email = (arg('email') ?? '').trim().toLowerCase();
if (!email) fail('--email est obligatoire.');

try {
  if (command === 'create-admin') {
    const role = (arg('role') ?? 'super_admin') as (typeof ADMIN_ROLES)[number];
    if (!ADMIN_ROLES.includes(role)) fail(`rôle invalide (${ADMIN_ROLES.join(', ')}).`);
    const name = arg('name') ?? fail('--name est obligatoire.');
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(15).toString('base64url');
    if (password.length < 12) fail('ADMIN_PASSWORD doit contenir au moins 12 caractères.');
    const hash = await hashPassword(password, config.scryptLog2N);
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      await db.update(users).set({ adminRole: role, passwordHash: hash, emailVerifiedAt: existing.emailVerifiedAt ?? now, status: 'active', updatedAt: now }).where(eq(users.id, existing.id));
    } else {
      const [u] = await db
        .insert(users)
        .values({ id: newId('usr'), email, passwordHash: hash, name, emailVerifiedAt: now, adminRole: role, onboardingDone: true, termsAcceptedAt: now, createdAt: now, updatedAt: now })
        .returning();
      await db.insert(subscriptions).values({ id: newId('sub'), userId: u!.id, planId: 'free', status: 'active', startedAt: now, updatedAt: now });
    }
    await audit(db, { actorId: null, actorLabel: 'CLI', action: `Rôle ${role} attribué`, target: email, ip: null, level: 'warning' }, now);
    console.log(`Administrateur ${existing ? 'mis à jour' : 'créé'} : ${email} (${role}).`);
    if (!process.env.ADMIN_PASSWORD) console.log(`Mot de passe temporaire (affiché une seule fois, à changer) : ${password}`);
  } else if (command === 'set-role') {
    const role = arg('role');
    if (role !== 'none' && !ADMIN_ROLES.includes(role as never)) fail(`--role doit valoir none ou ${ADMIN_ROLES.join(', ')}.`);
    const r = await db.update(users).set({ adminRole: role === 'none' ? null : role!, updatedAt: now }).where(eq(users.email, email)).returning({ id: users.id });
    if (!r.length) fail('utilisateur introuvable.');
    await audit(db, { actorId: null, actorLabel: 'CLI', action: `Rôle modifié : ${role}`, target: email, ip: null, level: 'warning' }, now);
    console.log(`Rôle de ${email} : ${role}.`);
  } else if (command === 'set-plan') {
    const plan = arg('plan');
    if (!['free', 'pro', 'business'].includes(plan ?? '')) fail('--plan doit valoir free, pro ou business.');
    const [u] = await db.select().from(users).where(eq(users.email, email));
    if (!u) fail('utilisateur introuvable.');
    await db.update(subscriptions).set({ planId: plan!, status: 'active', updatedAt: now }).where(eq(subscriptions.userId, u!.id));
    await audit(db, { actorId: null, actorLabel: 'CLI', action: `Offre ${plan} attribuée manuellement`, target: email, ip: null }, now);
    console.log(`Offre de ${email} : ${plan} (attribution manuelle, aucun paiement traité).`);
  } else {
    fail('commande inconnue (create-admin | set-role | set-plan).');
  }
} finally {
  await handle.close();
}
