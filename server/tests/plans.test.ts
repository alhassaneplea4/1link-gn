import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, type UserFixture } from '../testing/fixtures.js';
import { subscriptions, users } from '../db/schema.js';
import { DAY_MS, computeAccess } from '../../src/models/access.js';
import { DEFAULT_APPEARANCE, getThemePreset } from '../../src/models/themes.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let n = 40;
async function signedIn(f: UserFixture = {}) {
  const u = await createUser(t.db, f);
  const c = t.client({ 'x-real-ip': `198.51.100.${n++}` });
  expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
  return { ...u, c };
}

const uname = () => `p${Math.random().toString(36).slice(2, 9)}`;
const profile = { id: 'blk_profile', type: 'profile', visible: true, data: { displayName: 'Awa', headline: '', bio: '', avatarUrl: '', coverUrl: '', location: '', verified: false } };
const link = (i: number) => ({ id: `lnk_${i}`, type: 'link', visible: true, data: { title: `Lien ${i}`, url: 'https://exemple.com', description: '', platform: 'link', highlight: false } });
const svc = (count: number) => ({ id: 'blk_svc', type: 'service', visible: true, data: { title: 'Services', items: Array.from({ length: count }, (_, i) => ({ id: `s${i}`, name: `S${i}`, description: '', price: '', url: '' })) } });
const text = { id: 'blk_txt', type: 'text', visible: true, data: { title: 'À propos', body: 'Bonjour' } };
const doc = (blocks: unknown[], appearance = DEFAULT_APPEARANCE, version = 0, username = uname()) =>
  ({ username, category: 'creator', blocks: [profile, ...blocks], appearance, share: { title: '', description: '' }, version });
/** Enregistre le brouillon en reprenant automatiquement la version courante (contrôle optimiste). */
async function put(c: Awaited<ReturnType<typeof signedIn>>['c'], body: ReturnType<typeof doc>) {
  const current = (await c.get('/api/me/page')).body as { version: number; username: string } | null;
  return c.put('/api/me/page/draft', { ...body, username: current?.username ?? body.username, version: current?.version ?? 0 });
}

describe('droits de l’offre Free', () => {
  it('accepte 4 liens, refuse le 5e, le bloc Texte et au-delà de 2 services', async () => {
    const { c } = await signedIn();
    expect((await put(c, doc([1, 2, 3, 4].map(link)))).status).toBe(200);
    const five = await put(c, doc([1, 2, 3, 4, 5].map(link)));
    expect([five.status, five.body.message, five.body.fields.feature]).toEqual([403, 'plan_required', 'links']);
    expect((await put(c, doc([text]))).body.fields.feature).toBe('block:text');
    expect((await put(c, doc([svc(3)]))).body.fields.feature).toBe('services');
    expect((await put(c, doc([svc(2)]))).status).toBe(200);
  });

  it('autorise les thèmes Minimal, Modern, Dark et l’onglet Couleurs, pas les autres thèmes ni les réglages Boutons, Texte, Mise en page, Fond', async () => {
    const { c } = await signedIn();
    expect((await put(c, doc([], getThemePreset('modern')))).status).toBe(200);
    expect((await put(c, doc([], getThemePreset('dark'), 1))).status).toBe(200);
    expect((await put(c, doc([], getThemePreset('professional'), 2))).body.fields.feature).toBe('theme:professional');
    const colors = { ...getThemePreset('dark'), themeId: 'custom' as const, colors: { ...getThemePreset('dark').colors, primary: '#ff0000' } };
    expect((await put(c, doc([], colors, 2))).status).toBe(200);
    const fonts = { ...colors, font: { ...colors.font, family: 'mono' as const } };
    expect((await put(c, doc([], fonts, 3))).body.fields.feature).toBe('tab:text');
    const layout = { ...colors, layout: { ...colors.layout, width: 'wide' as const } };
    expect((await put(c, doc([], layout, 3))).body.fields.feature).toBe('tab:layout');
  });

  it('n’a pas accès aux statistiques', async () => {
    const { c } = await signedIn();
    const r = await c.get('/api/me/analytics?from=2026-01-01&to=2026-01-07&preset=7d');
    expect([r.status, r.body.message, r.body.fields.feature]).toEqual([403, 'plan_required', 'analytics']);
  });
});

describe('droits des offres Basique, Pro et Business', () => {
  it('Basique : 10 liens, 5 services, bloc Texte, 6 thèmes, réglages Boutons et Texte — pas Mise en page ni Fond', async () => {
    const { c } = await signedIn({ plan: 'basic' });
    expect((await put(c, doc([...Array.from({ length: 10 }, (_, i) => link(i)), svc(5), text], getThemePreset('elegant')))).status).toBe(200);
    expect((await put(c, doc(Array.from({ length: 11 }, (_, i) => link(i)), getThemePreset('elegant'), 1))).body.fields.feature).toBe('links');
    const soft = getThemePreset('soft');
    expect((await put(c, doc([], soft, 1))).body.fields.feature).toBe('theme:soft');
    const base = getThemePreset('elegant');
    expect((await put(c, doc([], { ...base, button: { ...base.button, style: 'glass' } }, 1))).status).toBe(200);
    expect((await put(c, doc([], { ...base, background: { ...base.background, type: 'gradient' } }, 2))).body.fields.feature).toBe('tab:background');
  });

  it('Basique : statistiques limitées à aujourd’hui et 7 jours, sans détails par source', async () => {
    const { c } = await signedIn({ plan: 'basic' });
    const today = new Date().toISOString().slice(0, 10);
    const r = await c.get(`/api/me/analytics?from=2020-01-01&to=${today}&preset=custom`);
    expect(r.status).toBe(200);
    const span = (new Date(`${r.body.range.to}T00:00:00Z`).getTime() - new Date(`${r.body.range.from}T00:00:00Z`).getTime()) / DAY_MS + 1;
    expect(span).toBeLessThanOrEqual(7);
    expect(r.body.totals).toMatchObject({ views: 0, visitors: 0, clicks: 0 });
    expect([r.body.sources, r.body.devices, r.body.countries, r.body.topLinks]).toEqual([[], [], [], []]);
  });

  it('Pro : tout est permis (liens illimités, tous les blocs, tous les thèmes)', async () => {
    const { c } = await signedIn({ plan: 'pro' });
    const wa = { id: 'blk_wa', type: 'whatsapp', visible: true, data: { label: 'WhatsApp', phone: '+224622000000', message: '' } };
    expect((await put(c, doc([...Array.from({ length: 40 }, (_, i) => link(i)), wa, text], getThemePreset('creative')))).status).toBe(200);
  });
});

describe('essais gratuits et abonnement', () => {
  it('le compte est verrouillé quand l’essai de 7 jours est terminé : plus d’écriture, page publique indisponible', async () => {
    const { c, user } = await signedIn({ freeTrialEndsAt: new Date(Date.now() - DAY_MS), page: { username: uname(), published: true } });
    const session = (await c.get('/api/auth/session')).body;
    expect(session.access).toMatchObject({ phase: 'expired', locked: true, plan: 'free' });
    const blocked = await put(c, doc([link(1)]));
    expect([blocked.status, blocked.body.message]).toEqual([403, 'subscription_required']);
    const [row] = await t.db.select().from(users).where(eq(users.id, user.id));
    expect(row).toBeTruthy();
  });

  it('souscrire ouvre UN SEUL essai de 15 jours, sans paiement ; ensuite le paiement doit être confirmé par l’équipe', async () => {
    const { c, user } = await signedIn({ freeTrialEndsAt: new Date(Date.now() - DAY_MS) });
    const first = await c.post('/api/me/subscription/change', { planId: 'pro', period: 'monthly' });
    expect(first.body.status).toBe('changed');
    expect(first.body.subscription).toMatchObject({ planId: 'pro', status: 'trialing' });
    const days = (new Date(first.body.subscription.trialEndsAt).getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(14.9);
    expect(days).toBeLessThanOrEqual(15);
    const session = (await c.get('/api/auth/session')).body;
    expect(session.access).toMatchObject({ phase: 'paid_trial', plan: 'pro', locked: false, daysLeft: 15, paidTrialAvailable: false });
    expect(session.user.plan).toBe('pro');

    // L'essai est consommé : l'échéance passée, une nouvelle souscription ne redonne pas d'essai.
    await t.db.update(subscriptions).set({ trialEndsAt: new Date(Date.now() - DAY_MS) }).where(eq(subscriptions.userId, user.id));
    expect((await c.get('/api/auth/session')).body.access).toMatchObject({ phase: 'expired', locked: true, paidTrialAvailable: false });
    const again = await c.post('/api/me/subscription/change', { planId: 'pro', period: 'monthly' });
    expect(again.body).toEqual({ status: 'unavailable', reason: 'payments_not_connected' });
  });

  it('l’équipe active l’abonnement après paiement : il compte à partir de la fin de l’essai', async () => {
    const admin = await signedIn({ adminRole: 'finance' });
    const { c, user } = await signedIn({});
    const trial = await c.post('/api/me/subscription/change', { planId: 'basic', period: 'monthly' });
    const trialEnd = new Date(trial.body.subscription.trialEndsAt);
    const denied = await c.post(`/api/admin/users/${user.id}/subscription`, { planId: 'basic', period: 'monthly', method: 'mobile_money', reference: 'MM-1' });
    expect(denied.status).toBe(403);
    const ok = await admin.c.post(`/api/admin/users/${user.id}/subscription`, { planId: 'basic', period: 'monthly', method: 'mobile_money', reference: 'MM-1' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ planId: 'basic', status: 'active' });
    expect(new Date(ok.body.renewsAt).getTime()).toBeGreaterThan(trialEnd.getTime() + 27 * DAY_MS);
    expect((await c.get('/api/auth/session')).body.access).toMatchObject({ phase: 'subscribed', plan: 'basic', locked: false });
    const invoices = (await c.get('/api/me/invoices')).body;
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ status: 'paid', amount: 10_000, planId: 'basic' });
  });
});

describe('computeAccess (calcul pur)', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const base = { adminRole: null, paidTrialUsedAt: null, subscription: null };
  it('couvre toutes les phases', () => {
    expect(computeAccess({ ...base, freeTrialEndsAt: new Date(now.getTime() + 3 * DAY_MS) }, now)).toMatchObject({ phase: 'free_trial', plan: 'free', daysLeft: 3, locked: false });
    expect(computeAccess({ ...base, freeTrialEndsAt: new Date(now.getTime() - 1) }, now)).toMatchObject({ phase: 'expired', locked: true });
    expect(computeAccess({ ...base, freeTrialEndsAt: null }, now)).toMatchObject({ phase: 'expired', locked: true });
    expect(computeAccess({ ...base, adminRole: 'moderator', freeTrialEndsAt: null }, now)).toMatchObject({ phase: 'staff', plan: 'business', locked: false });
    const sub = { planId: 'pro', status: 'trialing', trialEndsAt: new Date(now.getTime() + DAY_MS), renewsAt: null };
    expect(computeAccess({ ...base, freeTrialEndsAt: null, subscription: sub }, now)).toMatchObject({ phase: 'paid_trial', plan: 'pro' });
    expect(computeAccess({ ...base, freeTrialEndsAt: null, subscription: { ...sub, status: 'active', trialEndsAt: null } }, now)).toMatchObject({ phase: 'subscribed', plan: 'pro' });
    expect(computeAccess({ ...base, freeTrialEndsAt: null, subscription: { ...sub, status: 'active', trialEndsAt: null, renewsAt: new Date(now.getTime() - 1) } }, now)).toMatchObject({ phase: 'expired' });
    expect(computeAccess({ ...base, freeTrialEndsAt: null, subscription: { ...sub, status: 'canceled' } }, now)).toMatchObject({ phase: 'expired' });
  });
});
