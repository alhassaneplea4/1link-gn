import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser } from '../testing/fixtures.js';
import { media, pages, securityEvents, users } from '../db/schema.js';
import { processDeletionRequests } from '../services/account-deletion.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let n = 0;
const ip = () => ({ 'x-real-ip': `203.0.113.${(n++ % 200) + 1}` });
const settle = () => new Promise((r) => setTimeout(r, 60));
const text = (r: { body: unknown }) => r.body as string;

describe('référencement', () => {
  it('rend les balises de partage d’une page publique dans le HTML brut (titre, description, image, canonique, données structurées)', async () => {
    await createUser(t.db, { name: 'Awa Diallo', page: { username: 'awa-seo', published: true } });
    const r = await t.client(ip()).get('/api/seo/awa-seo');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    const html = text(r);
    expect(html).toContain('<title>Awa Diallo · 1Link</title>');
    expect(html).toContain('<meta property="og:title" content="Awa Diallo · 1Link" />');
    expect(html).toMatch(/<link rel="canonical" href="http:\/\/localhost:5173\/awa-seo" \/>/);
    expect(html).toContain('<meta name="robots" content="index,follow,max-image-preview:large" />');
    expect(html).toContain('<meta property="og:image" content="http://localhost:5173/og-default.png" />');
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1);
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!);
    expect(ld).toMatchObject({ '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: 'Awa Diallo' } });
    expect(html).not.toMatch(/@exemple\.test|\+224 ?6/); // aucune donnée privée
  });

  it('échappe le contenu saisi par l’utilisateur (aucune balise injectable)', async () => {
    const hostile = '"/><script>alert(1)</script>';
    await createUser(t.db, { name: 'Xss', page: { username: 'xss-seo', published: true } });
    await t.db.execute(sql`update pages set published = jsonb_set(published, '{share}', ${JSON.stringify({ title: hostile, description: hostile })}::jsonb) where username = 'xss-seo'`);
    const html = text(await t.client(ip()).get('/api/seo/xss-seo'));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('404 pour un pseudo inconnu (noindex), l’application telle quelle pour ses propres routes, noindex pour les comptes de test', async () => {
    const unknown = await t.client(ip()).get('/api/seo/personne-ici');
    expect(unknown.status).toBe(404);
    expect(text(unknown)).toContain('noindex,nofollow');
    const own = await t.client(ip()).get('/api/seo/pricing');
    expect(own.status).toBe(200);
    expect(text(own)).not.toContain('og:type" content="profile"');
    const { seedTestAccounts } = await import('../services/test-accounts.js');
    await seedTestAccounts(t.db, 'Mot-de-passe-solide-1', 10);
    expect(text(await t.client(ip()).get('/api/seo/test-createur'))).toContain('noindex,nofollow');
  }, 60000);

  it('plan du site : pages du site + pages publiées actives, sans brouillon, compte suspendu ni compte de test', async () => {
    await createUser(t.db, { page: { username: 'visible-seo', published: true } });
    await createUser(t.db, { page: { username: 'brouillon-seo', published: false } });
    await createUser(t.db, { suspended: true, page: { username: 'suspendu-seo', published: true } });
    const r = await t.client(ip()).get('/api/sitemap.xml');
    const xml = text(r);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/xml');
    expect(xml).toContain('<loc>http://localhost:5173/pricing</loc>');
    expect(xml).toContain('<loc>http://localhost:5173/legal/privacy</loc>');
    expect(xml).toContain('<loc>http://localhost:5173/visible-seo</loc>');
    for (const hidden of ['brouillon-seo', 'suspendu-seo', 'test-createur']) expect(xml).not.toContain(hidden);
  });
});

describe('suppression du compte (15 jours sans activité, puis confirmation par mot de passe)', () => {
  const tokenOf = (to: string) => decodeURIComponent(/token=([^\s&]+)/.exec(t.mailer.outbox.filter((m) => m.to === to && /Confirmez la suppression/.test(m.subject)).at(-1)!.text)![1]!);

  it('demande → 15 jours sans connexion → lien → mot de passe → effacement définitif de la page, des images et des traces', async () => {
    const u = await createUser(t.db, { name: 'Partant', page: { username: 'partant', published: true } });
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    await t.db.insert(media).values({ id: 'med_aaaaaaaaaaaaaaaaaaaa', userId: u.user.id, mime: 'image/png', size: 1, sha256: 'x', data: Buffer.from([1]), createdAt: new Date() });
    await t.db.insert(securityEvents).values({ id: 'sec_x1', at: new Date(), kind: 'failed_login', subject: u.email!, userId: null, ip: '1.2.3.4', level: 'info' });

    expect((await c.post('/api/me/delete/request', {})).status).toBe(422);
    expect((await c.post('/api/me/delete/request', { password: 'Mauvais-mot-de-passe' })).body.message).toBe('wrong_password');
    expect((await c.post('/api/me/delete/request', { password: u.password })).status).toBe(204);
    expect((await c.get('/api/auth/session')).body).toBeNull(); // sessions fermées : le compte est « inactif »
    expect((await t.db.select().from(users).where(eq(users.id, u.user.id)))[0]!.deletionRequestedAt).not.toBeNull();

    // Avant 15 jours : rien n'est envoyé.
    t.clock.advance(14 * 86_400_000);
    expect(await processDeletionRequests(t.deps)).toEqual({ notified: 0, lapsed: 0 });
    t.clock.advance(2 * 86_400_000);
    expect(await processDeletionRequests(t.deps)).toEqual({ notified: 1, lapsed: 0 });
    const token = tokenOf(u.email!);

    const target = await t.client(ip()).post('/api/auth/delete/target', { token });
    expect(target.body).toMatchObject({ name: 'Partant', hasPassword: true });
    const anon = t.client(ip());
    expect((await anon.post('/api/auth/delete/confirm', { token })).status).toBe(422);
    expect((await anon.post('/api/auth/delete/confirm', { token, password: 'Mauvais-mot-de-passe' })).body.message).toBe('wrong_password');
    expect((await t.db.select().from(users).where(eq(users.id, u.user.id))).length).toBe(1);

    expect((await anon.post('/api/auth/delete/confirm', { token, password: u.password })).status).toBe(204);
    await settle();
    expect(t.mailer.outbox.at(-1)).toMatchObject({ to: u.email, subject: 'Votre compte 1Link a été supprimé' });
    expect((await t.db.select().from(users).where(eq(users.id, u.user.id))).length).toBe(0);
    expect((await t.db.select().from(pages).where(eq(pages.username, 'partant'))).length).toBe(0);
    expect((await t.db.select().from(media).where(eq(media.userId, u.user.id))).length).toBe(0);
    expect((await t.db.select().from(securityEvents).where(eq(securityEvents.subject, u.email!))).length).toBe(0);
    expect((await t.client(ip()).get('/api/pages/partant')).body.state).toBe('not_found');
    expect((await t.client(ip()).post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(401);
    expect((await anon.post('/api/auth/delete/confirm', { token, password: u.password })).status).toBe(422); // le lien ne sert qu'une fois
  });

  it('se reconnecter pendant le délai annule la demande', async () => {
    const u = await createUser(t.db, { name: 'Hésitant' });
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    await c.post('/api/me/delete/request', { password: u.password });
    t.clock.advance(5 * 86_400_000);
    const again = t.client(ip());
    expect((await again.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
    expect((await t.db.select().from(users).where(eq(users.id, u.user.id)))[0]!.deletionRequestedAt).toBeNull();
    t.clock.advance(20 * 86_400_000);
    expect(await processDeletionRequests(t.deps)).toMatchObject({ notified: 0 });
  });

  it('un lien non confirmé dans les 7 jours est abandonné : le compte est conservé', async () => {
    const u = await createUser(t.db, { name: 'Distrait' });
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    await c.post('/api/me/delete/request', { password: u.password });
    t.clock.advance(16 * 86_400_000);
    expect((await processDeletionRequests(t.deps)).notified).toBe(1);
    const token = tokenOf(u.email!);
    t.clock.advance(8 * 86_400_000);
    expect((await processDeletionRequests(t.deps)).lapsed).toBe(1);
    expect((await t.client(ip()).post('/api/auth/delete/confirm', { token, password: u.password })).body.message).toMatch(/token_expired|invalid_token/);
    expect((await t.db.select().from(users).where(eq(users.id, u.user.id))).length).toBe(1);
  });

  it('un compte sans mot de passe confirme avec un code envoyé par e-mail', async () => {
    const email = `sans-mdp-${Date.now().toString(36)}@exemple.test`;
    const c = t.client(ip());
    await c.post('/api/auth/email-code/request', { email });
    const code = lastCode(email);
    const up = await c.post('/api/auth/email-code/verify', { email, code, acceptTerms: true });
    expect(up.body.user).toMatchObject({ email, hasPassword: false, emailVerified: true });
    t.clock.advance(31_000);
    t.clock.advance(31_000);
    await c.post('/api/me/identity/code');
    expect((await c.post('/api/me/delete/request', { code: lastCode(email) })).status).toBe(204);
    t.clock.advance(16 * 86_400_000);
    await processDeletionRequests(t.deps);
    const token = tokenOf(email);
    const anon = t.client(ip());
    expect((await anon.post('/api/auth/delete/target', { token })).body.hasPassword).toBe(false);
    t.clock.advance(31_000);
    expect((await anon.post('/api/auth/delete/code', { token })).status).toBe(200);
    expect((await anon.post('/api/auth/delete/confirm', { token, code: '000000' })).body.message).toBe('invalid_code');
    expect((await anon.post('/api/auth/delete/confirm', { token, code: lastCode(email) })).status).toBe(204);
    expect((await t.db.select().from(users).where(eq(users.email, email))).length).toBe(0);
  });

  it('refuse la demande d’un administrateur et exige d’être connecté', async () => {
    const admin = await createUser(t.db, { adminRole: 'admin', onboardingDone: true });
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: admin.email, password: admin.password });
    const r = await c.post('/api/me/delete/request', { password: admin.password });
    expect([r.status, r.body.message]).toEqual([409, 'admin_account']);
    expect((await t.client(ip()).post('/api/me/delete/request', { password: 'x' })).status).toBe(401);
  });
});

/** Dernier code à six chiffres reçu par e-mail à cette adresse (boîte d'envoi simulée). */
function lastCode(to: string): string {
  const m = t.mailer.outbox.filter((x) => x.to === to && /est votre code 1Link/.test(x.subject)).at(-1);
  return /(\d{6}) est votre code 1Link/.exec(m!.subject)![1]!;
}
