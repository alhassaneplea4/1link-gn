import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, lastMailCode, type TestApp, type TestClient } from '../testing/harness.js';
import { createUser, type UserFixture } from '../testing/fixtures.js';
import { sessions, users } from '../db/schema.js';
import { totpAt } from '../lib/totp.js';

/** MFA obligatoire pour l'Admin Center : le garde lit le facteur de la SESSION, pas seulement les réglages du compte. */
let t: TestApp;
beforeAll(async () => void (t = await createTestApp({ overrides: { adminRequireMfa: true } })));
afterAll(async () => t.close());

let n = 0;
const ip = () => ({ 'x-real-ip': `198.18.90.${(n++ % 200) + 1}` });
const wait = (s = 31) => t.clock.advance(s * 1000);

async function admin(f: UserFixture = {}) {
  const u = await createUser(t.db, { adminRole: 'super_admin', ...f });
  const c = t.client(ip());
  const r = await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
  return { ...u, c, first: r };
}
/** Active l'application d'authentification dans la session courante ; renvoie le secret. */
async function enableTotp(c: TestClient, password: string): Promise<string> {
  const secret = (await c.post('/api/me/mfa/totp/setup', { password })).body.secret as string;
  const r = await c.post('/api/me/mfa/totp/enable', { code: totpAt(secret, t.clock.now().getTime()) });
  expect(r.status).toBe(200);
  return secret;
}

describe('Admin Center : session à un seul facteur', () => {
  it('refuse l’accès à un administrateur connecté par un seul facteur, sur toutes les routes d’administration', async () => {
    const a = await admin();
    expect(a.first.status).toBe(200);
    expect(a.first.body.user.adminRole).toBe('super_admin');
    expect(a.first.body.adminMfaRequired).toBe(true);
    for (const path of ['/api/admin/users', '/api/admin/overview?from=2026-01-01&to=2026-01-02', '/api/admin/nav-badges', '/api/admin/cards/orders', '/api/admin/roles']) {
      const r = await a.c.get(path);
      expect([path, r.status, r.body.message]).toEqual([path, 403, 'admin_mfa_required']);
    }
    expect((await a.c.patch(`/api/admin/users/${a.user.id}/badge`, { verified: true })).status).toBe(403);
    expect((await a.c.get('/api/auth/session')).body.adminMfaRequired).toBe(true);
    expect((await a.c.get('/api/me/mfa')).status).toBe(200); // c'est ici qu'il active son second facteur
  });

  it('s’ouvre dès que le second facteur est activé DANS la session (application d’authentification)', async () => {
    const a = await admin();
    expect((await a.c.get('/api/admin/users')).status).toBe(403);
    await enableTotp(a.c, a.password);
    expect((await a.c.get('/api/admin/users')).status).toBe(200);
    expect((await a.c.get('/api/auth/session')).body.adminMfaRequired).toBe(false);
    const [row] = await t.db.select().from(sessions).where(eq(sessions.userId, a.user.id));
    expect(row!.authFactor).toBe('mfa');
  });

  it('une nouvelle connexion mot de passe + application d’authentification ouvre une session « mfa »', async () => {
    const a = await admin();
    const secret = await enableTotp(a.c, a.password);
    wait();
    const c2 = t.client(ip());
    const step1 = await c2.post('/api/auth/sign-in', { email: a.email, password: a.password });
    expect(step1.body.twoFactor.method).toBe('totp');
    const done = await c2.post('/api/auth/sign-in/mfa', { challenge: step1.body.twoFactor.challenge, method: 'totp', code: totpAt(secret, t.clock.now().getTime()) });
    expect(done.status).toBe(200);
    expect(done.body.adminMfaRequired).toBe(false);
    expect((await c2.get('/api/admin/users')).status).toBe(200);
  });

  it('la connexion par code e-mail suivie du code de l’application donne aussi accès', async () => {
    const a = await admin();
    const secret = await enableTotp(a.c, a.password);
    wait();
    const c2 = t.client(ip());
    await c2.post('/api/auth/email-code/request', { email: a.email });
    const step1 = await c2.post('/api/auth/email-code/verify', { email: a.email, code: lastMailCode(t, a.email!), acceptTerms: true });
    expect(step1.body.twoFactor.method).toBe('totp');
    wait();
    const done = await c2.post('/api/auth/sign-in/mfa', { challenge: step1.body.twoFactor.challenge, method: 'totp', code: totpAt(secret, t.clock.now().getTime()) });
    expect(done.status).toBe(200);
    expect(done.body.adminMfaRequired).toBe(false);
    expect((await c2.get('/api/admin/users')).status).toBe(200);
  });

  it('un administrateur avec la vérification par SMS est accepté après le code SMS', async () => {
    const phone = '+224622910001';
    const a = await admin({ phone, phoneVerified: true });
    await t.db.update(users).set({ twoFactorSms: true }).where(eq(users.id, a.user.id));
    wait();
    const c2 = t.client(ip());
    const step1 = await c2.post('/api/auth/sign-in', { email: a.email, password: a.password });
    expect(step1.body.twoFactor.method).toBe('sms');
    const done = await c2.post('/api/auth/sign-in/mfa', { challenge: step1.body.twoFactor.challenge, method: 'sms', code: t.otp.sent.at(-1)!.code });
    expect(done.status).toBe(200);
    expect((await c2.get('/api/admin/users')).status).toBe(200);
  });

  it('un second facteur activé mais NON franchi dans la session ne suffit pas (session ouverte plus tôt, à un seul facteur)', async () => {
    const a = await admin(); // session à un facteur
    const other = t.client(ip());
    await other.post('/api/auth/sign-in', { email: a.email, password: a.password });
    await enableTotp(other, a.password); // le second facteur existe désormais, mais pas dans la session de `a.c`
    expect((await a.c.get('/api/admin/users')).status).toBe(403);
  });
});

describe('ce qui n’est pas concerné', () => {
  it('un utilisateur sans rôle d’administration passe comme avant (il reçoit 403 « forbidden », pas « admin_mfa_required »)', async () => {
    const u = await createUser(t.db);
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    const r = await c.get('/api/admin/users');
    expect([r.status, r.body.message]).toEqual([403, 'forbidden']);
    expect((await c.get('/api/auth/session')).body.adminMfaRequired).toBe(false);
  });

  it('désactivé par ADMIN_REQUIRE_MFA=0 (échappatoire d’exploitation) : accès par un seul facteur', async () => {
    const open = await createTestApp({ overrides: { adminRequireMfa: false } });
    try {
      const u = await createUser(open.db, { adminRole: 'super_admin' });
      const c = open.client(ip());
      expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password })).body.adminMfaRequired).toBe(false);
      expect((await c.get('/api/admin/users')).status).toBe(200);
    } finally {
      await open.close();
    }
  });

  it('la configuration par défaut l’exige en production et l’autorise à désactiver explicitement', async () => {
    const { loadConfig } = await import('../config.js');
    const prod = { DATABASE_URL: 'postgres://x', NODE_ENV: 'production' };
    expect(loadConfig(prod).adminRequireMfa).toBe(true);
    expect(loadConfig({ ...prod, ADMIN_REQUIRE_MFA: '0' }).adminRequireMfa).toBe(false);
    expect(loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://x' }).adminRequireMfa).toBe(false);
  });
});
