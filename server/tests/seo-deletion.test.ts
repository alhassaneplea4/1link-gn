import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, FIXTURE_PASSWORD } from '../testing/fixtures.js';
import { media, pages, securityEvents, users } from '../db/schema.js';

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

describe('suppression du compte', () => {
  it('exige le mot de passe, puis efface le compte, la page, les images et les traces de sécurité', async () => {
    const u = await createUser(t.db, { name: 'Partant', page: { username: 'partant', published: true } });
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    await t.db.insert(media).values({ id: 'med_aaaaaaaaaaaaaaaaaaaa', userId: u.user.id, mime: 'image/png', size: 1, sha256: 'x', data: Buffer.from([1]), createdAt: new Date() });
    await t.db.insert(securityEvents).values({ id: 'sec_x1', at: new Date(), kind: 'failed_login', subject: u.email!, userId: null, ip: '1.2.3.4', level: 'info' });

    expect((await c.post('/api/me/delete', {})).status).toBe(422);
    expect((await c.post('/api/me/delete', { password: 'Mauvais-mot-de-passe' })).body.message).toBe('wrong_password');
    expect((await t.db.select().from(users).where(eq(users.id, u.user.id))).length).toBe(1);

    const ok = await c.post('/api/me/delete', { password: u.password });
    expect(ok.status).toBe(204);
    await settle();
    expect(t.mailer.outbox.at(-1)).toMatchObject({ to: u.email, subject: 'Votre compte 1Link a été supprimé' });
    expect((await t.db.select().from(users).where(eq(users.id, u.user.id))).length).toBe(0);
    expect((await t.db.select().from(pages).where(eq(pages.username, 'partant'))).length).toBe(0);
    expect((await t.db.select().from(media).where(eq(media.userId, u.user.id))).length).toBe(0);
    expect((await t.db.select().from(securityEvents).where(eq(securityEvents.subject, u.email!))).length).toBe(0);
    expect((await c.get('/api/auth/session')).body).toBeNull();
    expect((await t.client(ip()).get('/api/pages/partant')).body.state).toBe('not_found');
    expect((await t.client(ip()).post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(401);
  });

  it('un compte créé par téléphone se supprime avec un code SMS', async () => {
    const phone = '+224622990077';
    const c = t.client(ip());
    await c.post('/api/auth/otp/request', { phone, channel: 'sms' });
    await c.post('/api/auth/otp/verify', { phone, code: t.otp.sent.at(-1)!.code, mode: 'sign_up', name: 'Tel Partant', acceptTerms: true });
    expect((await c.post('/api/me/delete', { password: FIXTURE_PASSWORD })).status).toBe(422);
    t.clock.advance(31_000);
    expect((await c.post('/api/me/delete/request')).status).toBe(200);
    const good = t.otp.sent.at(-1)!.code;
    expect((await c.post('/api/me/delete', { code: good === '000000' ? '111111' : '000000' })).body.message).toBe('invalid_code');
    expect((await c.post('/api/me/delete', { code: good })).status).toBe(204);
    expect((await t.db.select().from(users).where(eq(users.phone, phone))).length).toBe(0);
  });

  it('refuse de supprimer un administrateur (rôle à retirer d’abord) et exige d’être connecté', async () => {
    const admin = await createUser(t.db, { adminRole: 'admin', onboardingDone: true });
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: admin.email, password: admin.password });
    const r = await c.post('/api/me/delete', { password: admin.password });
    expect([r.status, r.body.message]).toEqual([409, 'admin_account']);
    expect((await t.client(ip()).post('/api/me/delete', { password: 'x' })).status).toBe(401);
  });
});
