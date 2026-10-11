import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp, type TestClient } from '../testing/harness.js';
import { createUser, FIXTURE_PASSWORD } from '../testing/fixtures.js';
import { sessions, users } from '../db/schema.js';
import { OTP_RESEND_SEC } from '../services/accounts.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

const settle = () => new Promise((r) => setTimeout(r, 60));
const lastCode = () => t.otp.sent.at(-1)!.code;
let n = 0;
const nextPhone = () => `+22462200${String(2000 + n++).padStart(4, '0')}`;
const nextIp = () => `198.51.100.${(n % 200) + 1}`;

async function signedIn(opts: Parameters<typeof createUser>[1] = {}): Promise<{ c: TestClient; email: string; password: string; id: string }> {
  const created = await createUser(t.db, opts);
  const c = t.client({ 'x-real-ip': nextIp() });
  const r = await c.post('/api/auth/sign-in', { email: created.email, password: created.password });
  expect(r.status).toBe(200);
  return { c, email: created.email!, password: created.password, id: created.user.id };
}

/** Associe `phone` au compte connecté par la voie normale (code SMS + preuve de possession). */
async function linkPhone(c: TestClient, phone: string) {
  expect((await c.post('/api/me/phone/request', { phone })).status).toBe(200);
  const done = await c.post('/api/me/phone/verify', { phone, code: lastCode() });
  t.clock.advance((OTP_RESEND_SEC + 1) * 1000); // le délai anti-rafale du numéro est écoulé quand la connexion suivante demande un code
  return done;
}

describe('ajout du numéro de téléphone au compte', () => {
  it('exige la preuve de possession : le numéro n’est associé qu’avec le bon code', async () => {
    const { c, id } = await signedIn();
    const phone = nextPhone();
    const req = await c.post('/api/me/phone/request', { phone });
    expect(req.body).toMatchObject({ channel: 'sms', resendInSec: OTP_RESEND_SEC });
    expect(t.otp.sent.at(-1)).toMatchObject({ phone, channel: 'sms' });

    const bad = await c.post('/api/me/phone/verify', { phone, code: lastCode() === '000000' ? '111111' : '000000' });
    expect(bad.body.message).toBe('invalid_code');
    const [before] = await t.db.select().from(users).where(eq(users.id, id));
    expect(before!.phone).toBeNull();

    const ok = await c.post('/api/me/phone/verify', { phone, code: lastCode() });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ phone, phoneVerified: true, twoFactorSms: false });
  });

  it('refuse un numéro déjà utilisé par un autre compte', async () => {
    const taken = nextPhone();
    await createUser(t.db, { email: null, phone: taken, phoneVerified: true });
    const { c } = await signedIn();
    expect((await c.post('/api/me/phone/request', { phone: taken })).status).toBe(200);
    const r = await c.post('/api/me/phone/verify', { phone: taken, code: lastCode() });
    expect([r.status, r.body.message]).toEqual([409, 'phone_taken']);
  });

  it('exige d’être connecté', async () => {
    const c = t.client({ 'x-real-ip': nextIp() });
    expect((await c.post('/api/me/phone/request', { phone: nextPhone() })).status).toBe(401);
    expect((await c.post('/api/me/2fa', { enabled: true, password: FIXTURE_PASSWORD })).status).toBe(401);
  });

  it('retirer le numéro exige le mot de passe et désactive la double authentification', async () => {
    const { c, password } = await signedIn();
    const phone = nextPhone();
    await linkPhone(c, phone);
    await c.post('/api/me/2fa', { enabled: true, password });
    expect((await c.post('/api/me/phone/remove', { password: 'Mauvais-mot-de-passe' })).body.message).toBe('wrong_password');
    const ok = await c.post('/api/me/phone/remove', { password });
    expect(ok.body.user).toMatchObject({ phone: null, phoneVerified: false, twoFactorSms: false });
  });

  it('un compte créé par téléphone ne peut pas retirer son seul moyen de connexion', async () => {
    const phone = nextPhone();
    const c = t.client({ 'x-real-ip': nextIp() });
    await c.post('/api/auth/otp/request', { phone, channel: 'sms' });
    await c.post('/api/auth/otp/verify', { phone, code: lastCode(), mode: 'sign_up', name: 'Tel Seul', acceptTerms: true });
    const r = await c.post('/api/me/phone/remove', { password: 'peu-importe' });
    expect([r.status, r.body.message]).toEqual([409, 'only_login']);
  });
});

describe('double authentification par SMS à la connexion', () => {
  it('ne s’active qu’avec un numéro vérifié ET le mot de passe', async () => {
    const { c, password } = await signedIn();
    expect((await c.post('/api/me/2fa', { enabled: true, password })).body.message).toBe('phone_required');
    await linkPhone(c, nextPhone());
    expect((await c.post('/api/me/2fa', { enabled: true, password: 'Mauvais-mot-de-passe' })).body.message).toBe('wrong_password');
    const on = await c.post('/api/me/2fa', { enabled: true, password });
    expect(on.body.user.twoFactorSms).toBe(true);
    expect((await c.get('/api/auth/session')).body.user.twoFactorSms).toBe(true);
    const off = await c.post('/api/me/2fa', { enabled: false, password });
    expect(off.body.user.twoFactorSms).toBe(false);
  });

  it('le mot de passe seul n’ouvre aucune session : un code SMS est exigé', async () => {
    const { c, email, password } = await signedIn();
    const phone = nextPhone();
    await linkPhone(c, phone);
    await c.post('/api/me/2fa', { enabled: true, password });

    const fresh = t.client({ 'x-real-ip': nextIp() });
    const step1 = await fresh.post('/api/auth/sign-in', { email, password });
    expect(step1.status).toBe(200);
    expect(step1.body.user).toBeUndefined();
    expect(step1.body.twoFactor).toMatchObject({ channel: 'sms', resendInSec: OTP_RESEND_SEC });
    expect(step1.body.twoFactor.phoneMasked).not.toContain(phone.slice(4, 10)); // numéro masqué
    expect(step1.headers.get('set-cookie')).toBeNull();
    expect((await fresh.get('/api/auth/session')).body).toBeNull();
    expect(t.otp.sent.at(-1)).toMatchObject({ phone, channel: 'sms' });

    const { challenge } = step1.body.twoFactor;
    const bad = await fresh.post('/api/auth/sign-in/2fa', { challenge, code: lastCode() === '000000' ? '111111' : '000000' });
    expect(bad.body.message).toBe('invalid_code');
    expect((await fresh.get('/api/auth/session')).body).toBeNull();

    const ok = await fresh.post('/api/auth/sign-in/2fa', { challenge, code: lastCode() });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email);
    expect(ok.headers.get('set-cookie')).toMatch(/onelink_session=/);
    expect((await fresh.get('/api/auth/session')).body.user.email).toBe(email);
  });

  it('rejette un jeton falsifié, expiré ou fabriqué sans mot de passe', async () => {
    const { c, email, password } = await signedIn();
    await linkPhone(c, nextPhone());
    await c.post('/api/me/2fa', { enabled: true, password });

    const fresh = t.client({ 'x-real-ip': nextIp() });
    const { challenge } = (await fresh.post('/api/auth/sign-in', { email, password })).body.twoFactor;
    const forged = `${challenge.split('.')[0]}.${'a'.repeat(64)}`;
    expect((await fresh.post('/api/auth/sign-in/2fa', { challenge: forged, code: lastCode() })).status).toBe(401);
    expect((await fresh.post('/api/auth/sign-in/2fa', { challenge: 'x'.repeat(40), code: lastCode() })).status).toBe(401);
    expect((await fresh.post('/api/auth/sign-in/2fa/resend', { challenge: forged })).status).toBe(401);

    t.clock.advance(11 * 60_000); // le jeton vit 10 min
    expect((await fresh.post('/api/auth/sign-in/2fa', { challenge, code: lastCode() })).status).toBe(401);
    expect((await fresh.get('/api/auth/session')).body).toBeNull();
  });

  it('renvoi du code plafonné (30 s) puis possible', async () => {
    const { c, email, password } = await signedIn();
    await linkPhone(c, nextPhone());
    await c.post('/api/me/2fa', { enabled: true, password });
    const fresh = t.client({ 'x-real-ip': nextIp() });
    const { challenge } = (await fresh.post('/api/auth/sign-in', { email, password })).body.twoFactor;
    expect((await fresh.post('/api/auth/sign-in/2fa/resend', { challenge })).body.message).toBe('resend_too_soon');
    t.clock.advance((OTP_RESEND_SEC + 1) * 1000);
    const again = await fresh.post('/api/auth/sign-in/2fa/resend', { challenge });
    expect(again.status).toBe(200);
    expect((await fresh.post('/api/auth/sign-in/2fa', { challenge, code: lastCode() })).status).toBe(200);
  });

  it('un mauvais mot de passe ne déclenche aucun SMS', async () => {
    const { c, email, password } = await signedIn();
    await linkPhone(c, nextPhone());
    await c.post('/api/me/2fa', { enabled: true, password });
    const before = t.otp.sent.length;
    const r = await t.client({ 'x-real-ip': nextIp() }).post('/api/auth/sign-in', { email, password: 'Mauvais-mot-de-passe' });
    expect(r.status).toBe(401);
    expect(t.otp.sent.length).toBe(before);
  });

  it('un compte suspendu ne peut pas terminer la connexion', async () => {
    const { c, email, password, id } = await signedIn();
    await linkPhone(c, nextPhone());
    await c.post('/api/me/2fa', { enabled: true, password });
    const fresh = t.client({ 'x-real-ip': nextIp() });
    const { challenge } = (await fresh.post('/api/auth/sign-in', { email, password })).body.twoFactor;
    await t.db.update(users).set({ status: 'suspended' }).where(eq(users.id, id));
    expect((await fresh.post('/api/auth/sign-in/2fa', { challenge, code: lastCode() })).status).toBe(401);
  });
});

describe('réinitialisation du mot de passe par SMS', () => {
  it('réponse identique pour un numéro connu et inconnu ; SMS seulement pour un compte réel', async () => {
    const known = nextPhone();
    await createUser(t.db, { phone: known, phoneVerified: true });
    const unknown = nextPhone();
    const before = t.otp.sent.length;

    const a = await t.client({ 'x-real-ip': nextIp() }).post('/api/auth/password/forgot-phone', { phone: known });
    const b = await t.client({ 'x-real-ip': nextIp() }).post('/api/auth/password/forgot-phone', { phone: unknown });
    await settle();
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(Object.keys(a.body).sort()).toEqual(Object.keys(b.body).sort());
    expect({ ...a.body, devCode: undefined }).toEqual({ ...b.body, devCode: undefined });
    expect(t.otp.sent.slice(before).map((s) => s.phone)).toEqual([known]);
  });

  it('réinitialise le mot de passe, coupe les sessions ouvertes et permet la reconnexion', async () => {
    const phone = nextPhone();
    const created = await createUser(t.db, { phone, phoneVerified: true });
    const old = t.client({ 'x-real-ip': nextIp() });
    await old.post('/api/auth/sign-in', { email: created.email, password: created.password });
    expect((await old.get('/api/auth/session')).body.user).toBeTruthy();

    const c = t.client({ 'x-real-ip': nextIp() });
    await c.post('/api/auth/password/forgot-phone', { phone });
    await settle();
    const code = lastCode();

    // Mot de passe faible : refusé SANS consommer le code.
    expect((await c.post('/api/auth/password/reset-phone', { phone, code, password: 'password123' })).body.message).toBe('weak_password');
    // Mauvais code : refusé.
    expect((await c.post('/api/auth/password/reset-phone', { phone, code: code === '000000' ? '111111' : '000000', password: 'Nouveau-mot-de-passe-2026' })).body.message).toBe('invalid_code');

    const ok = await c.post('/api/auth/password/reset-phone', { phone, code, password: 'Nouveau-mot-de-passe-2026' });
    expect(ok.status).toBe(204);
    // Le code est à usage unique.
    expect((await c.post('/api/auth/password/reset-phone', { phone, code, password: 'Autre-mot-de-passe-2026' })).status).toBeGreaterThanOrEqual(400);

    expect((await old.get('/api/auth/session')).body).toBeNull();
    const rows = await t.db.select().from(sessions).where(eq(sessions.userId, created.user.id));
    expect(rows).toHaveLength(0);
    expect((await t.client({ 'x-real-ip': nextIp() }).post('/api/auth/sign-in', { email: created.email, password: created.password })).status).toBe(401);
    expect((await t.client({ 'x-real-ip': nextIp() }).post('/api/auth/sign-in', { email: created.email, password: 'Nouveau-mot-de-passe-2026' })).status).toBe(200);
  });

  it('un numéro sans compte (ou non vérifié) ne permet aucune réinitialisation', async () => {
    const phone = nextPhone();
    const c = t.client({ 'x-real-ip': nextIp() });
    await c.post('/api/auth/password/forgot-phone', { phone });
    await settle();
    // Aucun SMS parti : un code « deviné » ne doit rien ouvrir.
    const r = await c.post('/api/auth/password/reset-phone', { phone, code: '123456', password: 'Nouveau-mot-de-passe-2026' });
    expect(r.status).toBeGreaterThanOrEqual(400);

    const unverified = nextPhone();
    const created = await createUser(t.db, { phone: unverified, phoneVerified: false });
    await c.post('/api/auth/password/forgot-phone', { phone: unverified });
    await settle();
    expect(t.otp.sent.some((s) => s.phone === unverified)).toBe(false);
    const r2 = await c.post('/api/auth/password/reset-phone', { phone: unverified, code: '123456', password: 'Nouveau-mot-de-passe-2026' });
    expect(r2.status).toBeGreaterThanOrEqual(400);
    expect((await t.client({ 'x-real-ip': nextIp() }).post('/api/auth/sign-in', { email: created.email, password: created.password })).status).toBe(200);
  });

  it('plafonne les demandes par numéro', async () => {
    const phone = nextPhone();
    await createUser(t.db, { phone, phoneVerified: true });
    const c = t.client({ 'x-real-ip': nextIp() });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await c.post('/api/auth/password/forgot-phone', { phone })).status);
      t.clock.advance((OTP_RESEND_SEC + 1) * 1000);
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
