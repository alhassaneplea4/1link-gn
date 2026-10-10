/**
 * Fixtures de TEST uniquement (jamais importées par le code de production, jamais exécutées sur une base réelle) :
 * créent des comptes, pages et événements directement en base pour que les tests partent d'un état connu.
 * La plateforme livrée ne contient AUCUNE donnée d'exemple : la base de production démarre vide.
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { pageEvents, pages, payments, reports, securityEvents, auditLogs, subscriptions, supportTickets, users, verifications, type PageContent } from '../db/schema.js';
import { hashPassword, newId } from '../lib/crypto.js';
import type { AdminRole, PlanId } from '../../src/models/auth.js';
import type { AppearanceConfig } from '../../src/models/appearance.js';
import type { AnyBlock } from '../../src/models/blocks.js';
import type { CategoryId } from '../../src/models/category.js';

export const FIXTURE_PASSWORD = 'Test-Passw0rd-2026';

export const FIXTURE_APPEARANCE: AppearanceConfig = {
  themeId: 'minimal',
  colors: { primary: '#2563eb', accent: '#7c3aed', text: '#111827', textMuted: '#4b5563', background: '#ffffff', surface: '#f3f4f6', border: '#e5e7eb' },
  button: { style: 'filled', radius: 'medium', customRadius: 12 }, radius: 'medium', customRadius: 12,
  font: { family: 'jakarta', size: 'md', weight: 'regular' },
  layout: { width: 'narrow', align: 'center', spacing: 'comfortable', density: 'comfortable', profilePosition: 'top', linkLayout: 'stack', columns: 1 },
  background: { type: 'solid', gradient: { from: '#2563eb', to: '#7c3aed', angle: 135 }, imageUrl: '', overlay: 0.3, pattern: 'dots' },
  cardStyle: 'card',
};

export function fixtureContent(displayName: string, category: CategoryId = 'creator'): PageContent {
  const blocks: AnyBlock[] = [
    { id: 'blk_profile', type: 'profile', visible: true, data: { displayName, headline: 'Créateur de contenu', bio: 'Page de test', avatarUrl: '', coverUrl: '', location: 'Conakry', verified: false } },
    { id: 'blk_link', type: 'link', visible: true, data: { title: 'Mon site', url: 'https://exemple.com', description: '', platform: 'link', highlight: false } },
    { id: 'blk_wa', type: 'whatsapp', visible: true, data: { label: 'Me contacter', phone: '+224622000000', message: 'Bonjour' } },
  ];
  return { blocks, appearance: FIXTURE_APPEARANCE, share: { title: '', description: '' }, category };
}

export interface UserFixture {
  name?: string;
  email?: string | null;
  phone?: string | null;
  password?: string;
  plan?: PlanId;
  adminRole?: AdminRole | null;
  category?: CategoryId | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  suspended?: boolean;
  verified?: boolean;
  onboardingDone?: boolean;
  /** Crée une page : brouillon, ou publiée sous ce pseudonyme. */
  page?: { username: string; published?: boolean; content?: PageContent };
}

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}.${Date.now().toString(36)}${(counter++).toString(36)}@exemple.test`;

export async function createUser(db: Db, f: UserFixture = {}) {
  const now = new Date();
  const email = f.email === undefined ? uniqueEmail() : f.email;
  const password = f.password ?? FIXTURE_PASSWORD;
  const name = f.name ?? 'Utilisateur Test';
  const [user] = await db
    .insert(users)
    .values({
      id: newId('usr'), email, phone: f.phone ?? null, passwordHash: email ? await hashPassword(password, 10) : null, name,
      emailVerifiedAt: f.emailVerified === false || !email ? null : now, phoneVerifiedAt: f.phoneVerified ? now : null, category: f.category ?? (f.page ? 'creator' : null),
      onboardingDone: f.onboardingDone ?? Boolean(f.page), adminRole: f.adminRole ?? null, status: f.suspended ? 'suspended' : 'active', verified: f.verified ?? false, createdAt: now, updatedAt: now, lastActiveAt: now,
    })
    .returning();
  await db.insert(subscriptions).values({ id: newId('sub'), userId: user!.id, planId: f.plan ?? 'free', status: 'active', period: 'monthly', startedAt: now, updatedAt: now });
  let page;
  if (f.page) {
    const content = f.page.content ?? fixtureContent(name, (f.category ?? 'creator') as CategoryId);
    [page] = await db
      .insert(pages)
      .values({
        id: newId('pg'), userId: user!.id, username: f.page.username, status: f.page.published ? 'published' : 'draft', draft: content,
        published: f.page.published ? { ...content, blocks: content.blocks.filter((b) => b.visible) } : null, version: 1, createdAt: now, updatedAt: now, publishedAt: f.page.published ? now : null,
      })
      .returning();
  }
  return { user: user!, email, password, page };
}

export async function createReport(db: Db, pageId: string | null, username: string, o: { reason?: 'spam' | 'scam' | 'impersonation' | 'inappropriate' | 'copyright' | 'other'; status?: 'open' | 'in_review' | 'resolved' | 'dismissed'; details?: string } = {}) {
  const now = new Date();
  const [row] = await db
    .insert(reports)
    .values({
      id: newId('rep'), pageId, username, reason: o.reason ?? 'spam', status: o.status ?? 'open', priority: o.reason === 'scam' ? 'high' : 'medium', details: o.details ?? 'Signalement de test',
      contentExcerpt: o.details ?? 'Signalement de test', reporterHash: newId('h'), createdAt: now, updatedAt: now, history: [{ at: now.toISOString(), event: 'Signalement reçu depuis la page publique', actor: 'Visiteur' }],
    })
    .returning();
  return row!;
}

export async function addEvents(db: Db, pageId: string, n: { views?: number; clicks?: number; blockId?: string; daysAgo?: number; source?: string | null; device?: string; country?: string | null }) {
  const at = new Date(Date.now() - (n.daysAgo ?? 0) * 86_400_000);
  const rows = [
    ...Array.from({ length: n.views ?? 0 }, (_, i) => ({ pageId, kind: 'view', blockId: null, source: n.source ?? null, device: n.device ?? 'mobile', country: n.country ?? 'GN', visitor: `v${i}${at.getTime()}`, at })),
    ...Array.from({ length: n.clicks ?? 0 }, (_, i) => ({ pageId, kind: 'click', blockId: n.blockId ?? 'blk_link', source: n.source ?? null, device: n.device ?? 'mobile', country: n.country ?? 'GN', visitor: `v${i}${at.getTime()}`, at })),
  ];
  if (rows.length) await db.insert(pageEvents).values(rows);
}

export async function createPayment(db: Db, userId: string, o: { amount?: number; status?: 'paid' | 'pending' | 'failed' | 'refunded'; plan?: PlanId } = {}) {
  const [row] = await db.insert(payments).values({ id: newId('pay'), userId, planId: o.plan ?? 'pro', amount: o.amount ?? 49_000, currency: 'GNF', status: o.status ?? 'paid', method: 'mobile_money' }).returning();
  return row!;
}

export async function createTicket(db: Db, userId: string | null, subject: string) {
  const [row] = await db.insert(supportTickets).values({ id: newId('tkt'), userId, subject }).returning();
  return row!;
}

export async function createPendingVerification(db: Db, userId: string, legalName = 'Entreprise Test SARL') {
  const [row] = await db.insert(verifications).values({ id: newId('ver'), userId, kind: 'business', legalName, registryNumber: 'RCCM/GN/2026', proofUrl: 'https://exemple.com/registre', note: '' }).returning();
  return row!;
}

export async function addLogs(db: Db) {
  await db.insert(auditLogs).values({ id: newId('aud'), actorLabel: 'Admin Test', action: 'Page suspendue', target: 'exemple', ip: '10.0.0.1', level: 'warning' });
  await db.insert(securityEvents).values({ id: newId('sec'), kind: 'failed_login', subject: 'inconnu@exemple.test', ip: '10.0.0.2', level: 'info' });
}

export const getUserByEmail = async (db: Db, email: string) => (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
export const pageOf = async (db: Db, userId: string) => (await db.select().from(pages).where(and(eq(pages.userId, userId))).limit(1))[0];
