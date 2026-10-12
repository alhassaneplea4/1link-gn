import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { addEvents, createReport, createUser, FIXTURE_APPEARANCE, fixtureContent, type UserFixture } from '../testing/fixtures.js';
import { pageEvents, pages, users } from '../db/schema.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

const DESKTOP = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const MOBILE = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' };
let ipCounter = 10;
const nextIp = () => `192.0.2.${ipCounter++}`;

async function signedIn(f: UserFixture = {}) {
  const u = await createUser(t.db, f);
  const c = t.client({ 'x-real-ip': nextIp() });
  expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
  return { ...u, c };
}

const doc = (username: string, version = 0, extra: Record<string, unknown> = {}) => {
  const content = fixtureContent('Awa Test');
  return { username, category: 'creator', blocks: content.blocks, appearance: FIXTURE_APPEARANCE, share: { title: '', description: '' }, version, ...extra };
};
const uname = () => `u${Math.random().toString(36).slice(2, 9)}`;

describe('brouillon', () => {
  it('crée puis met à jour la page avec un contrôle de version (pas d’écrasement entre onglets)', async () => {
    const { c } = await signedIn();
    expect((await c.get('/api/me/page')).body).toBeNull();
    const username = uname();
    const first = await c.put('/api/me/page/draft', doc(username, 0));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ username, version: 1, status: 'draft', category: 'creator' });
    const second = await c.put('/api/me/page/draft', doc(username, 1));
    expect(second.body.version).toBe(2);
    const stale = await c.put('/api/me/page/draft', doc(username, 1)); // un autre onglet a déjà enregistré la version 1
    expect([stale.status, stale.body.message, stale.body.fields.version]).toEqual([409, 'version_conflict', '2']);
    expect((await c.get('/api/me/page')).body.version).toBe(2);
  });

  it('valide le pseudonyme : format, mots réservés, unicité', async () => {
    const { c } = await signedIn();
    expect((await c.put('/api/me/page/draft', doc('A!', 0))).body).toMatchObject({ message: 'username_invalid' });
    expect((await c.put('/api/me/page/draft', doc('admin', 0))).body).toMatchObject({ message: 'username_reserved' });
    const taken = uname();
    const other = await signedIn();
    await other.c.put('/api/me/page/draft', doc(taken, 0));
    const r = await c.put('/api/me/page/draft', doc(taken, 0));
    expect([r.status, r.body.message]).toEqual([409, 'username_taken']);
    expect((await c.get(`/api/usernames/check?username=${taken}`)).body).toEqual({ available: false, reason: 'taken' });
    expect((await other.c.get(`/api/usernames/check?username=${taken}`)).body).toEqual({ available: true }); // le propriétaire peut le garder
    expect((await c.get('/api/usernames/check?username=admin')).body).toEqual({ available: false, reason: 'reserved' });
  });

  it('respecte la limite de blocs de l’offre et rejette les doublons d’identifiant', async () => {
    const { c } = await signedIn({ plan: 'free' });
    const many = fixtureContent('X').blocks;
    const blocks = Array.from({ length: 11 }, (_, i) => ({ ...many[1]!, id: `b${i}` }));
    expect((await c.put('/api/me/page/draft', { ...doc(uname(), 0), blocks })).body.message).toBe('plan_limit');
    const dup = [many[0]!, { ...many[1]!, id: 'same' }, { ...many[1]!, id: 'same' }];
    expect((await c.put('/api/me/page/draft', { ...doc(uname(), 0), blocks: dup })).body.message).toBe('duplicate_block');
    const pro = await signedIn({ plan: 'pro' });
    expect((await pro.c.put('/api/me/page/draft', { ...doc(uname(), 0), blocks })).status).toBe(200);
  });

  it('rejette les contenus dangereux ou mal formés', async () => {
    const { c } = await signedIn();
    const base = fixtureContent('X').blocks;
    const xss = [{ ...base[1]!, data: { ...(base[1] as any).data, url: 'javascript:alert(1)' } }];
    expect((await c.put('/api/me/page/draft', { ...doc(uname(), 0), blocks: xss })).status).toBe(422);
    const dataUrl = [{ ...base[0]!, data: { ...(base[0] as any).data, avatarUrl: 'data:image/svg+xml;base64,PHN2Zy8+' } }];
    expect((await c.put('/api/me/page/draft', { ...doc(uname(), 0), blocks: dataUrl })).status).toBe(422);
    expect((await c.put('/api/me/page/draft', { ...doc(uname(), 0), blocks: [{ id: 'z', type: 'script', visible: true, data: {} }] })).status).toBe(422);
    expect((await c.put('/api/me/page/draft', { ...doc(uname(), 0), appearance: { ...FIXTURE_APPEARANCE, colors: { ...FIXTURE_APPEARANCE.colors, primary: 'url(javascript:1)' } } })).status).toBe(422);
    expect((await c.put('/api/me/page/draft', { ...doc(uname(), 0), blocks: 'oops' })).status).toBe(422);
    const long = [{ ...base[0]!, data: { ...(base[0] as any).data, bio: 'a'.repeat(5000) } }];
    expect((await c.put('/api/me/page/draft', { ...doc(uname(), 0), blocks: long })).status).toBe(422);
  });

  it('autorise un brouillon incomplet mais refuse sa publication', async () => {
    const { c } = await signedIn({ emailVerified: true });
    const base = fixtureContent('X').blocks;
    const badLink = [base[0]!, { ...base[1]!, data: { ...(base[1] as any).data, url: 'pas une adresse' } }];
    const username = uname();
    expect((await c.put('/api/me/page/draft', { ...doc(username, 0), blocks: badLink })).status).toBe(200);
    expect((await c.post('/api/me/page/publish', { ...doc(username, 1), blocks: badLink })).status).toBe(422);
  });

  it('écrase toute tentative de se décerner le badge « vérifié »', async () => {
    const { c } = await signedIn({ verified: false });
    const base = fixtureContent('X').blocks;
    const forged = [{ ...base[0]!, data: { ...(base[0] as any).data, verified: true } }];
    const saved = await c.put('/api/me/page/draft', { ...doc(uname(), 0), blocks: forged });
    expect(saved.body.blocks[0].data.verified).toBe(false);
  });

  it('exige une session', async () => {
    expect((await t.client().put('/api/me/page/draft', doc(uname(), 0))).status).toBe(401);
    expect((await t.client().get('/api/me/page')).status).toBe(401);
  });
});

describe('publication et page publique', () => {
  it('publie sans exiger la confirmation de l’e-mail, masque les blocs cachés, puis dépublie', async () => {
    const unverified = await signedIn({ emailVerified: false });
    expect((await unverified.c.post('/api/me/page/publish', doc(uname(), 0))).status).toBe(200);

    const { c } = await signedIn();
    const username = uname();
    const base = fixtureContent('Awa').blocks;
    const blocks = [...base, { id: 'hidden1', type: 'text', visible: false, data: { title: 'SECRET', body: 'privé' } }];
    const pub = await c.post('/api/me/page/publish', { ...doc(username, 0), blocks });
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ status: 'published', username, version: 1 });
    expect((await c.get('/api/me/page')).body.blocks.some((b: any) => b.id === 'hidden1')).toBe(true); // le propriétaire garde son brouillon

    const visitor = t.client();
    const page = await visitor.get(`/api/pages/${username}`);
    expect(page.body.state).toBe('published');
    expect(JSON.stringify(page.body)).not.toContain('SECRET');
    expect(page.body.branding).toBe(true);
    expect(page.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate'); // le navigateur revalide toujours
    expect(page.headers.get('vercel-cdn-cache-control')).toContain('max-age=10'); // le CDN met en cache quelques secondes
    expect(JSON.stringify(page.body)).not.toMatch(/passwordHash|@exemple\.test|usr_/);

    const down = await c.post('/api/me/page/unpublish');
    expect(down.body.status).toBe('draft');
    expect((await visitor.get(`/api/pages/${username}`)).body).toEqual({ state: 'draft' });
  });

  it('applique l’absence de marque pour les offres payantes et gère les états d’indisponibilité', async () => {
    const pro = await signedIn({ plan: 'pro' });
    const username = uname();
    await pro.c.post('/api/me/page/publish', doc(username, 0));
    expect((await t.client().get(`/api/pages/${username}`)).body.branding).toBe(false);
    expect((await t.client().get('/api/pages/personne-ici')).body).toEqual({ state: 'not_found' });
    await t.db.update(users).set({ status: 'suspended' }).where(eq(users.id, pro.user.id));
    expect((await t.client().get(`/api/pages/${username}`)).body).toEqual({ state: 'suspended' });
  });

  it('empêche de publier une page suspendue par la modération', async () => {
    const { c, user } = await signedIn();
    const username = uname();
    await c.post('/api/me/page/publish', doc(username, 0));
    await t.db.update(pages).set({ status: 'suspended' }).where(eq(pages.userId, user.id));
    const r = await c.post('/api/me/page/publish', doc(username, 1));
    expect([r.status, r.body.message]).toEqual([403, 'page_suspended']);
    expect((await c.post('/api/me/page/unpublish')).status).toBe(403);
  });

  it('un compte créé et vérifié par téléphone seul (sans e-mail) peut publier', async () => {
    const c = t.client({ 'x-real-ip': nextIp() });
    const phone = '+224622123456';
    await c.post('/api/auth/otp/request', { phone, channel: 'whatsapp' });
    const up = await c.post('/api/auth/otp/verify', { phone, code: t.otp.sent.at(-1)!.code, mode: 'sign_up', name: 'Tel Seul', acceptTerms: true });
    expect(up.body.user).toMatchObject({ email: null, emailVerified: false, phoneVerified: true });
    const pub = await c.post('/api/me/page/publish', doc(uname(), 0));
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe('published');
  });

  it('conserve l’ancien contenu publié tant qu’on n’a pas republié (le brouillon reste privé)', async () => {
    const { c } = await signedIn();
    const username = uname();
    await c.post('/api/me/page/publish', doc(username, 0));
    const blocks = fixtureContent('Nouveau nom').blocks;
    await c.put('/api/me/page/draft', { ...doc(username, 1), blocks });
    const live = (await t.client().get(`/api/pages/${username}`)).body.page.blocks[0].data.displayName;
    expect(live).toBe('Awa Test');
  });
});

describe('mesure d’audience', () => {
  async function publishedPage() {
    const owner = await signedIn();
    const username = uname();
    await owner.c.post('/api/me/page/publish', doc(username, 0));
    return { ...owner, username };
  }

  it('compte vues, clics, canaux et appareils ; ignore robots, propriétaire et « Ne pas me suivre »', async () => {
    const { c, username } = await publishedPage();
    const view = (headers: Record<string, string>, src?: string) => t.client({ 'x-real-ip': nextIp(), 'x-vercel-ip-country': 'GN', ...headers }).post(`/api/pages/${username}/events`, { type: 'view', source: src });
    expect((await view(MOBILE, 'whatsapp')).status).toBe(204);
    expect((await view(MOBILE, 'whatsapp')).status).toBe(204);
    expect((await view(DESKTOP, 'tiktok')).status).toBe(204);
    await view({ 'user-agent': 'Googlebot/2.1' });
    await view({ ...DESKTOP, dnt: '1' });
    expect((await c.post(`/api/pages/${username}/events`, { type: 'view' }, DESKTOP)).status).toBe(204); // le propriétaire
    const click = await t.client({ 'x-real-ip': nextIp(), ...MOBILE }).post(`/api/pages/${username}/events`, { type: 'click', blockId: 'blk_link', source: 'whatsapp' });
    expect(click.status).toBe(204);
    expect((await t.client({ 'x-real-ip': nextIp(), ...MOBILE }).post(`/api/pages/${username}/events`, { type: 'click', blockId: 'inconnu' })).status).toBe(422);

    const today = new Date().toISOString().slice(0, 10);
    const rep = (await c.get(`/api/me/analytics?from=${today}&to=${today}&preset=today`)).body;
    expect(rep.totals).toMatchObject({ views: 3, clicks: 1 });
    expect(rep.series).toHaveLength(24);
    expect(rep.devices.find((d: any) => d.name === 'mobile').value).toBe(2);
    expect(rep.sources.map((s: any) => s.name)).toEqual(expect.arrayContaining(['whatsapp', 'tiktok']));
    expect(rep.topLinks[0]).toMatchObject({ blockId: 'blk_link', label: 'Mon site', clicks: 1 });
    expect(rep.countries[0].name).toMatch(/Guin/);
    expect(await t.db.select().from(pageEvents)).toBeTruthy();
  });

  it('ne stocke aucune adresse IP ni identifiant durable dans les événements', async () => {
    const { username } = await publishedPage();
    await t.client({ 'x-real-ip': '203.0.113.77', ...MOBILE }).post(`/api/pages/${username}/events`, { type: 'view' });
    const dump = JSON.stringify(await t.db.select().from(pageEvents));
    expect(dump).not.toContain('203.0.113.77');
  });

  it('calcule les périodes, la comparaison à la période précédente et borne selon l’offre', async () => {
    const { c, user } = await signedIn({ plan: 'free' });
    const username = uname();
    await c.post('/api/me/page/publish', doc(username, 0));
    const [page] = await t.db.select().from(pages).where(eq(pages.userId, user.id));
    await addEvents(t.db, page!.id, { views: 4, daysAgo: 1 });
    await addEvents(t.db, page!.id, { views: 2, daysAgo: 8 }); // période précédente (7 j)
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const from = ymd(new Date(Date.now() - 6 * 86_400_000));
    const rep = (await c.get(`/api/me/analytics?from=${from}&to=${ymd(new Date())}&preset=7d`)).body;
    expect(rep.totals.views).toBe(4);
    expect(rep.deltas.views).toBe(1); // 4 vs 2 → +100 %
    expect(rep.series).toHaveLength(7);
    const wide = (await c.get(`/api/me/analytics?from=${ymd(new Date(Date.now() - 80 * 86_400_000))}&to=${ymd(new Date())}&preset=90d`)).body;
    expect(wide.range.from >= ymd(new Date(Date.now() - 7 * 86_400_000))).toBe(true); // l'offre gratuite limite à 7 jours
    expect((await c.get('/api/me/analytics?from=2026-13-40&to=nope')).status).toBe(422);
  });
});

describe('signalements de visiteurs', () => {
  it('enregistre un signalement, le limite à 3 par visiteur et par page, et borne le texte', async () => {
    const owner = await signedIn();
    const username = uname();
    await owner.c.post('/api/me/page/publish', doc(username, 0));
    const v = t.client({ 'x-real-ip': nextIp() });
    expect((await v.post(`/api/pages/${username}/reports`, { reason: 'scam', details: 'Arnaque' })).status).toBe(204);
    expect((await v.post(`/api/pages/${username}/reports`, { reason: 'spam', details: '' })).status).toBe(204);
    expect((await v.post(`/api/pages/${username}/reports`, { reason: 'other', details: '' })).status).toBe(204);
    expect((await v.post(`/api/pages/${username}/reports`, { reason: 'other', details: '' })).status).toBe(429);
    expect((await t.client({ 'x-real-ip': nextIp() }).post(`/api/pages/${username}/reports`, { reason: 'spam', details: 'x'.repeat(501) })).status).toBe(422);
    expect((await t.client({ 'x-real-ip': nextIp() }).post(`/api/pages/${username}/reports`, { reason: 'nimporte', details: '' })).status).toBe(422);
    expect((await t.client({ 'x-real-ip': nextIp() }).post('/api/pages/inexistante/reports', { reason: 'spam', details: '' })).status).toBe(404);
  });
});

describe('vérification du profil', () => {
  it('suit la demande de bout en bout : une seule demande en attente, attestation obligatoire', async () => {
    const { c } = await signedIn();
    const input = { kind: 'business', legalName: 'Kalou Studio SARL', registryNumber: 'RCCM/GN/2026', proofUrl: 'https://exemple.com/registre', note: '', attest: true };
    expect((await c.get('/api/me/verification')).body).toEqual({ status: 'none', request: null });
    expect((await c.post('/api/me/verification', input)).body.message).toBe('no_page'); // il faut d'abord une page
    await c.put('/api/me/page/draft', doc(uname(), 0));
    expect((await c.post('/api/me/verification', { ...input, attest: false })).status).toBe(422);
    expect((await c.post('/api/me/verification', { ...input, proofUrl: 'javascript:alert(1)' })).status).toBe(422);
    const ok = await c.post('/api/me/verification', input);
    expect(ok.body).toMatchObject({ status: 'pending', request: { legalName: 'Kalou Studio SARL', status: 'pending' } });
    expect((await c.post('/api/me/verification', input)).body.message).toBe('already_pending');
  });
});

describe('modération côté propriétaire de la page', () => {
  it('un signalement existant n’empêche pas le propriétaire d’éditer', async () => {
    const { c, user } = await signedIn();
    const username = uname();
    await c.post('/api/me/page/publish', doc(username, 0));
    const [page] = await t.db.select().from(pages).where(eq(pages.userId, user.id));
    await createReport(t.db, page!.id, username);
    expect((await c.put('/api/me/page/draft', doc(username, 1))).status).toBe(200);
  });
});
