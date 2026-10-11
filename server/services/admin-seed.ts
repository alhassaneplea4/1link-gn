/**
 * Création du premier administrateur (la base de production démarre vide : aucune donnée préinstallée).
 * Idempotent et prudent : un compte qui existe déjà garde son mot de passe (un changement fait depuis le site n'est jamais
 * écrasé par un redéploiement) ; on ne fait que lui garantir le rôle demandé.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { subscriptions, users } from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { hashPassword, newId } from '../lib/crypto.js';

export interface AdminSeed {
  email: string;
  password: string;
  name: string;
  /** Numéro principal (E.164). Il reste NON vérifié : la vérification exige un code SMS reçu sur ce téléphone. */
  phone?: string;
}

export type SeedOutcome = 'created' | 'role_granted' | 'unchanged';

export async function seedPlatformAdmin(db: Db, seed: AdminSeed, scryptLog2N: number, now = new Date()): Promise<SeedOutcome> {
  const email = seed.email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    if (existing.adminRole === 'super_admin' && existing.status === 'active') return 'unchanged';
    await db.update(users).set({ adminRole: 'super_admin', status: 'active', emailVerifiedAt: existing.emailVerifiedAt ?? now, updatedAt: now }).where(eq(users.id, existing.id));
    await audit(db, { actorId: null, actorLabel: 'Amorçage', action: 'Rôle super_admin attribué', target: email, ip: null, level: 'warning' }, now);
    return 'role_granted';
  }
  // Un numéro déjà rattaché à un autre compte n'est jamais repris.
  const phoneTaken = seed.phone ? (await db.select({ id: users.id }).from(users).where(eq(users.phone, seed.phone))).length > 0 : false;
  const [u] = await db
    .insert(users)
    .values({
      id: newId('usr'), email, passwordHash: await hashPassword(seed.password, scryptLog2N), name: seed.name.trim(), phone: seed.phone && !phoneTaken ? seed.phone : null,
      emailVerifiedAt: now, adminRole: 'super_admin', onboardingDone: false, termsAcceptedAt: now, createdAt: now, updatedAt: now,
    })
    .returning();
  await db.insert(subscriptions).values({ id: newId('sub'), userId: u!.id, planId: 'free', status: 'active', startedAt: now, updatedAt: now });
  await audit(db, { actorId: null, actorLabel: 'Amorçage', action: 'Administrateur créé (super_admin)', target: email, ip: null, level: 'warning' }, now);
  return 'created';
}

/** Lit ADMIN_SEED_* ; renvoie null quand rien n'est demandé ou que la configuration est incomplète/faible. */
export function adminSeedFromEnv(env: Record<string, string | undefined>): AdminSeed | null {
  const email = (env.ADMIN_SEED_EMAIL ?? '').trim();
  const password = env.ADMIN_SEED_PASSWORD ?? '';
  const name = (env.ADMIN_SEED_NAME ?? '').trim();
  if (!email || !password || !name) return null;
  if (password.length < 12) throw new Error('ADMIN_SEED_PASSWORD doit contenir au moins 12 caractères.');
  const phone = (env.ADMIN_SEED_PHONE ?? '').replace(/[\s.-]/g, '');
  return { email, password, name, phone: /^\+\d{8,15}$/.test(phone) ? phone : undefined };
}
