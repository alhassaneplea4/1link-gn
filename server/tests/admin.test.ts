import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { addEvents, addLogs, createPayment, createPendingVerification, createReport, createTicket, createUser } from '../testing/fixtures.js';
import { pages, reports, sessions, users } from '../db/schema.js';
import { ROLE_PERMISSIONS } from '../lib/access.js';
import { ADMIN_ROLES, type AdminRole } from '../../src/models/auth.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let ip = 1;
async function as(role: AdminRole | null) {
  const u = await createUser(t.db, { adminRole: role, name: `Test ${role ?? 'user'}` });
  const c = t.client({ 'x-real-ip': `198.18.0.${ip++}` });
  expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
  return { ...u, c };
}

describe('contrôle d’accès', () => {
  it('refuse les anonymes (401) et les comptes sans rôle (403)', async () => {
    expect((await t.client().get('/api/admin/users')).status).toBe(401);
    const { c } = await as(null);
    for (const path of ['/api/admin/users', '/api/admin/overview?from=2026-01-01&to=2026-01-02', '/api/admin/logs', '/api/admin/roles']) {
      expect((await c.get(path)).status).toBe(403);
    }
  });

  it('applique la matrice des rôles route par route (lecture)', async () => {
    const routes: [string, string][] = [
      ['/api/admin/users', 'users:read'], ['/api/admin/profiles', 'profiles:read'], ['/api/admin/subscriptions', 'subscriptions:read'], ['/api/admin/payments', 'payments:read'],
      ['/api/admin/tickets', 'support:read'], ['/api/admin/logs', 'logs:read'], ['/api/admin/security/events', 'security:read'], ['/api/admin/system/status', 'system:read'],
    ];
    for (const role of ADMIN_ROLES) {
      const { c } = await as(role);
      for (const [path, perm] of routes) {
        const expected = (ROLE_PERMISSIONS[role] as string[]).includes(perm) ? 200 : 403;
        expect([role, path, (await c.get(path)).status]).toEqual([role, path, expected]);
      }
    }
  });

  it('expose la session avec exactement les permissions du rôle', async () => {
    const { c } = await as('moderator');
    const s = (await c.get('/api/auth/session')).body;
    expect(s.permissions.sort()).toEqual([...ROLE_PERMISSIONS.moderator].sort());
    expect((await c.get('/api/admin/roles')).body.analyst).toEqual(ROLE_PERMISSIONS.analyst);
  });

  it('refuse les écritures sans la permission d’écriture', async () => {
    const analyst = await as('analyst');
    const target = await createUser(t.db);
    expect((await analyst.c.patch(`/api/admin/users/${target.user.id}/status`, { status: 'suspended' })).status).toBe(403);
    const rep = await createReport(t.db, null, 'x');
    expect((await analyst.c.post(`/api/admin/reports/${rep.id}/decision`, { decision: 'dismiss', note: '' })).status).toBe(403);
  });
});

describe('utilisateurs', () => {
  it('liste avec recherche, filtres, tri et pagination exécutés par la base', async () => {
    const admin = await as('super_admin');
    for (let i = 0; i < 5; i++) await createUser(t.db, { name: `Zed${i}`, category: i % 2 ? 'creator' : 'business', plan: i === 0 ? 'pro' : 'free' });
    const all = (await admin.c.get('/api/admin/users?page=1&pageSize=3&sort=name&dir=asc&search=Zed')).body;
    expect(all.total).toBe(5);
    expect(all.items.map((u: any) => u.name)).toEqual(['Zed0', 'Zed1', 'Zed2']);
    const p2 = (await admin.c.get('/api/admin/users?page=2&pageSize=3&sort=name&dir=asc&search=Zed')).body;
    expect(p2.items.map((u: any) => u.name)).toEqual(['Zed3', 'Zed4']);
    expect((await admin.c.get('/api/admin/users?search=Zed&plan=pro')).body.total).toBe(1);
    expect((await admin.c.get('/api/admin/users?search=Zed&category=business')).body.total).toBe(3);
    expect((await admin.c.get('/api/admin/users?search=Zed&category=all')).body.total).toBe(5);
    const desc = (await admin.c.get('/api/admin/users?search=Zed&sort=name&dir=desc')).body.items[0].name;
    expect(desc).toBe('Zed4');
  });

  it('résiste aux injections SQL dans la recherche, le tri et les filtres', async () => {
    const admin = await as('admin');
    const evil = encodeURIComponent("'; drop table users; --");
    expect((await admin.c.get(`/api/admin/users?search=${evil}`)).status).toBe(200);
    expect((await admin.c.get(`/api/admin/users?sort=${evil}&dir=${evil}`)).status).toBe(200);
    expect((await admin.c.get(`/api/admin/users?plan=${evil}`)).body.total).toBe(0);
    expect((await admin.c.get('/api/admin/users?search=%25')).status).toBe(200);
    expect((await t.db.select().from(users).limit(1)).length).toBe(1);
  });

  it('retourne le détail et l’historique, 404 si inconnu', async () => {
    const admin = await as('support');
    const { user } = await createUser(t.db, { name: 'Détail', page: { username: `det${ip}`, published: true } });
    const d = (await admin.c.get(`/api/admin/users/${user.id}`)).body;
    expect(d).toMatchObject({ id: user.id, name: 'Détail', pageStatus: 'published', blocksCount: 3 });
    expect(d.history.at(-1).event).toBe('Compte créé');
    expect((await admin.c.get('/api/admin/users/usr_inconnu')).status).toBe(404);
    const noPage = await createUser(t.db, { name: 'Sans page' }); // pas de pseudonyme : la fiche doit quand même s'afficher
    const d2 = (await admin.c.get(`/api/admin/users/${noPage.user.id}`)).body;
    expect(d2).toMatchObject({ name: 'Sans page', pageStatus: 'draft', blocksCount: 0, username: null });
  });

  it('suspend / réactive un compte : sessions révoquées, journal d’audit, pas d’auto-suspension, hiérarchie des rôles', async () => {
    const admin = await as('admin');
    const victim = await createUser(t.db);
    const vc = t.client({ 'x-real-ip': `198.19.0.${ip++}` });
    await vc.post('/api/auth/sign-in', { email: victim.email, password: victim.password });
    expect((await admin.c.patch(`/api/admin/users/${victim.user.id}/status`, { status: 'suspended' })).body).toEqual({ applied: true });
    expect((await vc.get('/api/auth/session')).body).toBeNull();
    expect(await t.db.select().from(sessions).where(eq(sessions.userId, victim.user.id))).toHaveLength(0);
    const logs = (await admin.c.get('/api/admin/logs?search=suspendu')).body;
    expect(logs.items[0]).toMatchObject({ action: 'Compte suspendu', target: victim.user.id, actor: admin.user.name, level: 'warning' });
    await admin.c.patch(`/api/admin/users/${victim.user.id}/status`, { status: 'active' });
    expect((await t.client().post('/api/auth/sign-in', { email: victim.email, password: victim.password })).status).toBe(200);

    expect((await admin.c.patch(`/api/admin/users/${admin.user.id}/status`, { status: 'suspended' })).status).toBe(403);
    const boss = await createUser(t.db, { adminRole: 'super_admin' });
    expect((await admin.c.patch(`/api/admin/users/${boss.user.id}/status`, { status: 'suspended' })).body.message).toBe('insufficient_role');
  });
});

describe('modération', () => {
  it('traite un signalement : suspension de la page, réactivation, avertissement par e-mail, journal', async () => {
    const mod = await as('moderator');
    const owner = await createUser(t.db, { name: 'Proprio', page: { username: `modo${ip}`, published: true } });
    const rep = await createReport(t.db, owner.page!.id, owner.page!.username!, { reason: 'scam' });
    const list = (await mod.c.get('/api/admin/reports?status=open&priority=high')).body;
    expect(list.items.some((r: any) => r.id === rep.id)).toBe(true);

    expect((await mod.c.post(`/api/admin/reports/${rep.id}/decision`, { decision: 'suspend', note: 'Arnaque avérée' })).body).toEqual({ applied: true });
    const visitor = t.client();
    expect((await visitor.get(`/api/pages/${owner.page!.username}`)).body).toEqual({ state: 'suspended' });
    const detail = (await mod.c.get(`/api/admin/reports/${rep.id}`)).body;
    expect(detail.status).toBe('resolved');
    expect(detail.history.at(-1)).toMatchObject({ event: 'Page suspendue — Arnaque avérée', actor: mod.user.name });
    expect((await mod.c.post(`/api/admin/reports/${rep.id}/decision`, { decision: 'dismiss', note: '' })).status).toBe(409); // déjà traité

    const rep2 = await createReport(t.db, owner.page!.id, owner.page!.username!);
    await mod.c.post(`/api/admin/reports/${rep2.id}/decision`, { decision: 'reinstate', note: '' });
    expect((await visitor.get(`/api/pages/${owner.page!.username}`)).body.state).toBe('published');

    const rep3 = await createReport(t.db, owner.page!.id, owner.page!.username!);
    await mod.c.post(`/api/admin/reports/${rep3.id}/decision`, { decision: 'warn', note: 'Merci de corriger' });
    await new Promise((r) => setTimeout(r, 50));
    expect(t.mailer.outbox.at(-1)).toMatchObject({ to: owner.email });
    expect((await mod.c.post('/api/admin/reports/rep_inconnu/decision', { decision: 'dismiss', note: '' })).status).toBe(404);
    expect((await mod.c.post(`/api/admin/reports/${rep3.id}/decision`, { decision: 'explose', note: '' })).status).toBe(422);
    expect((await t.db.select().from(reports).where(eq(reports.id, rep.id)))[0]!.status).toBe('resolved');
  });

  it('accorde ou refuse le badge « Profil vérifié » (seul moyen de l’obtenir)', async () => {
    const mod = await as('moderator');
    const owner = await createUser(t.db, { name: 'Vérifié', page: { username: `ver${ip}`, published: true } });
    const req = await createPendingVerification(t.db, owner.user.id);
    expect((await mod.c.get('/api/admin/verifications?status=pending')).body.items.some((v: any) => v.id === req.id && v.username === owner.page!.username)).toBe(true);
    expect((await mod.c.post(`/api/admin/verifications/${req.id}/decision`, { decision: 'reject', note: 'non' })).body.message).toBe('note_required');
    expect((await mod.c.post(`/api/admin/verifications/${req.id}/decision`, { decision: 'approve', note: 'Registre confirmé' })).body).toEqual({ applied: true });
    expect((await t.client().get(`/api/pages/${owner.page!.username}`)).body.page.blocks[0].data.verified).toBe(true);
    expect((await mod.c.post(`/api/admin/verifications/${req.id}/decision`, { decision: 'approve', note: '' })).status).toBe(409);
    const analyst = await as('analyst');
    expect((await analyst.c.post(`/api/admin/verifications/${req.id}/decision`, { decision: 'approve', note: '' })).status).toBe(403);
  });
});

describe('autres rubriques', () => {
  it('liste profils, abonnements, paiements, tickets, journaux, sécurité à partir de la base', async () => {
    const admin = await as('super_admin');
    const u = await createUser(t.db, { name: 'Payeur', plan: 'pro', page: { username: `pay${ip}`, published: true } });
    await createPayment(t.db, u.user.id, { amount: 49_000, status: 'paid' });
    await createTicket(t.db, u.user.id, 'Question facture');
    await addLogs(t.db);
    await addEvents(t.db, u.page!.id, { views: 3 });
    expect((await admin.c.get('/api/admin/profiles?search=pay')).body.items[0]).toMatchObject({ username: u.page!.username, owner: 'Payeur', status: 'published', blocks: 3, views30d: 3 });
    expect((await admin.c.get('/api/admin/subscriptions?plan=pro&search=Payeur')).body.items[0]).toMatchObject({ user: 'Payeur', plan: 'pro', status: 'active' });
    expect((await admin.c.get('/api/admin/payments?search=Payeur')).body.items[0]).toMatchObject({ amount: 49_000, status: 'paid', method: 'mobile_money', currency: 'GNF' });
    expect((await admin.c.get('/api/admin/tickets?search=facture')).body.items[0]).toMatchObject({ subject: 'Question facture', user: 'Payeur' });
    expect((await admin.c.get('/api/admin/logs?level=warning')).body.total).toBeGreaterThan(0);
    expect((await admin.c.get('/api/admin/security/events?kind=failed_login')).body.total).toBeGreaterThan(0);
  });

  it('calcule la vue d’ensemble de la plateforme depuis les données réelles', async () => {
    const admin = await as('analyst');
    const today = new Date().toISOString().slice(0, 10);
    const o = (await admin.c.get(`/api/admin/overview?from=${today}&to=${today}`)).body;
    expect(o.kpis.users).toBeGreaterThan(0);
    expect(o.series).toHaveLength(24);
    expect(o.kpis).toEqual(expect.objectContaining({ publishedPages: expect.any(Number), revenue: expect.any(Number), reports: expect.any(Number) }));
    expect((await admin.c.get('/api/admin/overview?from=bad&to=bad')).status).toBe(422);
  });

  it('rapporte l’état réel du système (base mesurée, fournisseurs non configurés = inconnu)', async () => {
    const admin = await as('super_admin');
    const s = (await admin.c.get('/api/admin/system/status')).body;
    const db = s.find((x: any) => x.id === 'db');
    expect(db.status).toBe('operational');
    expect(db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(s.find((x: any) => x.id === 'payments').status).toBe('unknown');
  });

  it('le flux temps réel exige la permission', async () => {
    const mod = await as('moderator');
    expect((await mod.c.get('/api/admin/realtime')).status).toBe(403);
  });
});

describe('données supprimées avec le compte', () => {
  it('supprime en cascade page, sessions et médias, et conserve les signalements sans page', async () => {
    const u = await createUser(t.db, { page: { username: `casc${ip}`, published: true } });
    const rep = await createReport(t.db, u.page!.id, u.page!.username!);
    await t.db.delete(users).where(eq(users.id, u.user.id));
    expect(await t.db.select().from(pages).where(eq(pages.userId, u.user.id))).toHaveLength(0);
    const [r] = await t.db.select().from(reports).where(eq(reports.id, rep.id));
    expect(r!.pageId).toBeNull();
  });
});
