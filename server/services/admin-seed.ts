/**
 * Création du premier administrateur (la base de production démarre vide : aucune donnée préinstallée).
 * Idempotent et prudent : un compte qui existe déjà garde son mot de passe (un changement fait depuis le site n'est jamais
 * écrasé par un redéploiement) ; on ne fait que lui garantir le rôle demandé.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { pages, subscriptions, users, type PageContent } from '../db/schema.js';
import { BASE, avatarPng, coverPng, storeMedia } from './test-accounts.js';
import { usernameProblem } from './pages.js';
import { audit } from '../lib/audit.js';
import { hashPassword, newId } from '../lib/crypto.js';

export interface AdminSeed {
  email: string;
  password: string;
  name: string;
  /** Numéro principal (E.164). Il reste NON vérifié : la vérification exige un code SMS reçu sur ce téléphone. */
  phone?: string;
  /** Adresse publique de la page de l'administrateur (/username) : créée si le compte n'a pas encore de page et que le nom est libre. */
  username?: string;
}

/** Crée la page publique de l'administrateur (profil, sans coordonnées personnelles) quand elle n'existe pas encore. */
async function ensureAdminPage(db: Db, userId: string, seed: AdminSeed, now: Date): Promise<boolean> {
  const username = seed.username?.trim().toLowerCase();
  if (!username || usernameProblem(username)) return false;
  const [mine] = await db.select({ id: pages.id }).from(pages).where(eq(pages.userId, userId));
  const [taken] = await db.select({ id: pages.id }).from(pages).where(eq(pages.username, username));
  if (mine || taken) return false;
  const from = '#2563eb';
  const to = '#7c3aed';
  const stamp = now.toISOString();
  const content: PageContent = {
    blocks: [
      { id: 'blk_profile', type: 'profile', visible: true, updatedAt: stamp, data: { displayName: seed.name, headline: 'Administration de la plateforme 1Link', bio: 'Équipe en charge de 1Link : une page, tous vos liens.', avatarUrl: await storeMedia(db, userId, avatarPng(from, to), now), coverUrl: await storeMedia(db, userId, coverPng(from, to), now), location: 'Guinée', verified: false } },
      { id: 'blk_link', type: 'link', visible: true, updatedAt: stamp, data: { title: 'Découvrir 1Link', url: 'https://1link-gn.vercel.app', description: 'Créez votre page en quelques minutes', platform: 'link', highlight: true } },
    ],
    appearance: { ...BASE, themeId: 'modern', colors: { primary: '#2563eb', accent: '#7c3aed', text: '#0f172a', textMuted: '#475569', background: '#f8fafc', surface: '#ffffff', border: '#e2e8f0' }, button: { style: 'gradient', radius: 'large', customRadius: 14 }, radius: 'large', cardStyle: 'floating' },
    share: { title: seed.name, description: 'Administration de la plateforme 1Link' },
    category: 'organization',
  };
  await db.insert(pages).values({ id: newId('pg'), userId, username, status: 'published', draft: content, published: content, version: 1, createdAt: now, updatedAt: now, publishedAt: now });
  await db.update(users).set({ onboardingDone: true, category: 'organization', updatedAt: now }).where(eq(users.id, userId));
  return true;
}

export type SeedOutcome = 'created' | 'role_granted' | 'unchanged';

export async function seedPlatformAdmin(db: Db, seed: AdminSeed, scryptLog2N: number, now = new Date()): Promise<SeedOutcome> {
  const email = seed.email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    if (existing.adminRole === 'super_admin' && existing.status === 'active') {
      // Certification : le super administrateur porte aussi le badge « Vérifié » (le badge « Officiel » suit son rôle).
      if (!existing.verified) await db.update(users).set({ verified: true, updatedAt: now }).where(eq(users.id, existing.id));
      return (await ensureAdminPage(db, existing.id, seed, now)) || !existing.verified ? 'role_granted' : 'unchanged';
    }
    await db.update(users).set({ adminRole: 'super_admin', verified: true, status: 'active', emailVerifiedAt: existing.emailVerifiedAt ?? now, updatedAt: now }).where(eq(users.id, existing.id));
    await audit(db, { actorId: null, actorLabel: 'Amorçage', action: 'Rôle super_admin attribué', target: email, ip: null, level: 'warning' }, now);
    await ensureAdminPage(db, existing.id, seed, now);
    return 'role_granted';
  }
  // Un numéro déjà rattaché à un autre compte n'est jamais repris.
  const phoneTaken = seed.phone ? (await db.select({ id: users.id }).from(users).where(eq(users.phone, seed.phone))).length > 0 : false;
  const [u] = await db
    .insert(users)
    .values({
      id: newId('usr'), email, passwordHash: await hashPassword(seed.password, scryptLog2N), name: seed.name.trim(), phone: seed.phone && !phoneTaken ? seed.phone : null,
      emailVerifiedAt: now, adminRole: 'super_admin', verified: true, onboardingDone: false, termsAcceptedAt: now, createdAt: now, updatedAt: now,
    })
    .returning();
  await db.insert(subscriptions).values({ id: newId('sub'), userId: u!.id, planId: 'free', status: 'active', startedAt: now, updatedAt: now });
  await ensureAdminPage(db, u!.id, seed, now);
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
  return { email, password, name, phone: /^\+\d{8,15}$/.test(phone) ? phone : undefined, username: (env.ADMIN_SEED_USERNAME ?? '').trim() || undefined };
}
