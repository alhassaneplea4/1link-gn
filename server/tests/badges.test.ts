import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, fixtureContent, FIXTURE_APPEARANCE } from '../testing/fixtures.js';
import { subscriptions, users } from '../db/schema.js';
import { badgesFor } from '../../src/models/badges.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let n = 0;
const ip = () => ({ 'x-real-ip': `100.64.1.${(n++ % 200) + 1}` });
let u = 0;
const handle = (p: string) => `${p}-${Date.now().toString(36)}${u++}`;
const publicBadges = async (username: string) => {
  const r = await t.client(ip()).get(`/api/pages/${username}`);
  const profile = r.body.page.blocks.find((b: { type: string }) => b.type === 'profile').data;
  return { badges: profile.badges as string[], verified: profile.verified as boolean };
};
const page = (username: string, version = 0) => ({ username, category: 'creator', blocks: fixtureContent('A').blocks, appearance: FIXTURE_APPEARANCE, share: { title: '', description: '' }, version });

describe('règles des badges', () => {
  it('classe les badges du plus élevé au plus bas', () => {
    expect(badgesFor({ adminRole: null, verified: false, plan: 'free' })).toEqual([]);
    expect(badgesFor({ adminRole: null, verified: false, plan: 'pro' })).toEqual(['pro']);
    expect(badgesFor({ adminRole: null, verified: true, plan: 'business' })).toEqual(['verified', 'business']);
    expect(badgesFor({ adminRole: 'super_admin', verified: false, plan: 'free' })).toEqual(['official', 'verified']);
    expect(badgesFor({ adminRole: 'moderator', verified: false, plan: 'pro' })).toEqual(['team', 'verified', 'pro']);
  });
});

describe('badges sur la page publique (calculés par le serveur)', () => {
  it('suivent l’abonnement actif, la vérification et le rôle', async () => {
    const free = handle('free');
    const pro = handle('pro');
    const biz = handle('biz');
    const ver = handle('ver');
    const sup = handle('sup');
    const mod = handle('mod');
    await createUser(t.db, { plan: 'free', page: { username: free, published: true } });
    await createUser(t.db, { plan: 'pro', page: { username: pro, published: true } });
    await createUser(t.db, { plan: 'business', page: { username: biz, published: true } });
    await createUser(t.db, { plan: 'pro', verified: true, page: { username: ver, published: true } });
    await createUser(t.db, { adminRole: 'super_admin', page: { username: sup, published: true } });
    await createUser(t.db, { adminRole: 'moderator', page: { username: mod, published: true } });
    expect(await publicBadges(free)).toEqual({ badges: [], verified: false });
    expect(await publicBadges(pro)).toEqual({ badges: ['pro'], verified: false });
    expect(await publicBadges(biz)).toEqual({ badges: ['business'], verified: false });
    expect(await publicBadges(ver)).toEqual({ badges: ['verified', 'pro'], verified: true });
    expect(await publicBadges(sup)).toEqual({ badges: ['official', 'verified'], verified: true });
    expect(await publicBadges(mod)).toEqual({ badges: ['team', 'verified'], verified: true });
  });

  it('un abonnement expiré ou résilié ne donne plus de badge', async () => {
    const name = handle('exp');
    const { user } = await createUser(t.db, { plan: 'business', page: { username: name, published: true } });
    expect((await publicBadges(name)).badges).toEqual(['business']);
    await t.db.update(subscriptions).set({ status: 'canceled' }).where(eq(subscriptions.userId, user.id));
    expect((await publicBadges(name)).badges).toEqual([]);
  });

  it('le client ne peut pas se donner un badge, et la session expose les siens', async () => {
    const { email, password } = await createUser(t.db, { plan: 'pro' });
    const c = t.client(ip());
    const login = await c.post('/api/auth/sign-in', { email, password });
    expect(login.body.user.badges).toEqual(['pro']);
    const forged = fixtureContent('A').blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, verified: true, badges: ['official', 'team'] } } : b));
    const username = handle('forge');
    const saved = await c.put('/api/me/page/draft', { ...page(username), blocks: forged });
    expect(saved.status).toBe(200);
    const mine = (await c.get('/api/me/page')).body.blocks.find((b: { type: string }) => b.type === 'profile').data;
    expect(mine.badges).toEqual(['pro']);
    expect(mine.verified).toBe(false);
  });
});

describe('gestion du badge Vérifié par l’administration', () => {
  it('un administrateur accorde puis retire le badge ; un simple utilisateur ne le peut pas', async () => {
    const name = handle('cible');
    const { user } = await createUser(t.db, { page: { username: name, published: true } });
    const admin = await createUser(t.db, { adminRole: 'admin', onboardingDone: true });
    const a = t.client(ip());
    await a.post('/api/auth/sign-in', { email: admin.email, password: admin.password });
    const grant = await a.patch(`/api/admin/users/${user.id}/badge`, { verified: true });
    expect(grant.status).toBe(200);
    expect((await publicBadges(name)).badges).toEqual(['verified']);
    const detail = (await a.get(`/api/admin/users/${user.id}`)).body;
    expect(detail).toMatchObject({ profileVerified: true, badges: ['verified'], adminRole: null });
    await a.patch(`/api/admin/users/${user.id}/badge`, { verified: false });
    expect((await publicBadges(name)).badges).toEqual([]);
    expect((await t.db.select().from(users).where(eq(users.id, user.id)))[0]!.verified).toBe(false);

    const plain = await createUser(t.db);
    const p = t.client(ip());
    await p.post('/api/auth/sign-in', { email: plain.email, password: plain.password });
    expect((await p.patch(`/api/admin/users/${user.id}/badge`, { verified: true })).status).toBe(403);
  });
});
