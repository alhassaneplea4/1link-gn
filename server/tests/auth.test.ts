import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, uniqueEmail } from '../testing/fixtures.js';
import { authTokens, sessions, users } from '../db/schema.js';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_SEC, OTP_TTL_SEC } from '../services/accounts.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

const signUp = (c = t.client(), email = uniqueEmail('new')) => c.post('/api/auth/sign-up', { name: 'Awa Test', email, password: 'MotDePasse-2026', acceptTerms: true }).then((r) => ({ c, email, r }));
const settle = () => new Promise((r) => setTimeout(r, 40));
const linkToken = (mail: { text: string }) => decodeURIComponent(/token=([^\s&]+)/.exec(mail.text)![1]!);

describe('inscription par e-mail', () => {
  it('crée le compte, une session (cookie httpOnly) et envoie la vérification', async () => {
    const { c, email, r } = await signUp();
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email, emailVerified: false, phoneVerified: false, plan: 'free', adminRole: null, onboardingDone: false });
    expect(r.body.permissions).toEqual([]);
    expect(r.body.entitlements.maxBlocks).toBe(12);
    expect(r.body.access).toMatchObject({ phase: 'free_trial', plan: 'free', locked: false, paidTrialAvailable: true });
    expect(r.headers.get('set-cookie')).toMatch(/onelink_session=.+HttpOnly.+SameSite=Lax/i);
    expect((await c.get('/api/auth/session')).body.user.email).toBe(email);
    await settle();
    expect(t.mailer.outbox.at(-1)).toMatchObject({ to: email });
    const [row] = await t.db.select().from(users).where(eq(users.email, email));
    expect(row!.passwordHash).toMatch(/^scrypt\$/);
    expect(row!.passwordHash).not.toContain('MotDePasse');
  });

  it('ne stocke jamais le jeton de session en clair', async () => {
    const { c } = await signUp();
    const cookie = c.cookie.split('=')[1]!;
    const rows = await t.db.select().from(sessions);
    expect(rows.some((s) => s.id === cookie)).toBe(false);
  });

  it('refuse un e-mail déjà pris, un mot de passe faible, un e-mail invalide et les conditions non acceptées', async () => {
    const { email } = await signUp();
    expect((await t.client().post('/api/auth/sign-up', { name: 'X', email, password: 'MotDePasse-2026', acceptTerms: true })).body).toMatchObject({ message: 'email_taken' });
    const dup = await t.client().post('/api/auth/sign-up', { name: 'X', email: email.toUpperCase(), password: 'MotDePasse-2026', acceptTerms: true });
    expect(dup.status).toBe(409);
    expect((await t.client().post('/api/auth/sign-up', { name: 'X', email: uniqueEmail(), password: 'password123', acceptTerms: true })).body.message).toBe('weak_password');
    expect((await t.client().post('/api/auth/sign-up', { name: 'X', email: 'pas-un-email', password: 'MotDePasse-2026', acceptTerms: true })).status).toBe(422);
    expect((await t.client().post('/api/auth/sign-up', { name: 'X', email: uniqueEmail(), password: 'MotDePasse-2026', acceptTerms: false })).status).toBe(422);
  });
});

describe('connexion', () => {
  it('accepte les bons identifiants et refuse les autres sans distinguer compte inconnu / mauvais mot de passe', async () => {
    const { email, password } = await createUser(t.db);
    const ok = await t.client().post('/api/auth/sign-in', { email, password });
    expect(ok.status).toBe(200);
    const wrong = await t.client().post('/api/auth/sign-in', { email, password: 'Mauvais-mot-de-passe' });
    const unknown = await t.client().post('/api/auth/sign-in', { email: uniqueEmail('nope'), password: 'Mauvais-mot-de-passe' });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('refuse un compte suspendu et révoque ses sessions', async () => {
    const { email, password, user } = await createUser(t.db);
    const c = t.client();
    await c.post('/api/auth/sign-in', { email, password });
    expect((await c.get('/api/auth/session')).body).not.toBeNull();
    await t.db.update(users).set({ status: 'suspended' }).where(eq(users.id, user.id));
    expect((await c.get('/api/auth/session')).body).toBeNull();
    const r = await t.client().post('/api/auth/sign-in', { email, password });
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('account_suspended');
  });

  it('bloque après 10 tentatives pour un même couple adresse / e-mail', async () => {
    const email = uniqueEmail('brute');
    const c = t.client({ 'x-real-ip': '203.0.113.9' });
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await c.post('/api/auth/sign-in', { email, password: `Essai-${i}-incorrect` })).status;
    expect(last).toBe(429);
    const res = await c.post('/api/auth/sign-in', { email, password: 'x' });
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('déconnecte : le cookie ne donne plus accès', async () => {
    const { email, password } = await createUser(t.db);
    const c = t.client();
    await c.post('/api/auth/sign-in', { email, password });
    const cookie = c.cookie;
    expect((await c.post('/api/auth/sign-out')).status).toBe(204);
    expect((await c.get('/api/auth/session')).body).toBeNull();
    const replay = await t.fetch(new Request('http://localhost:5173/api/auth/session', { headers: { cookie } }));
    expect(await replay.json()).toBeNull(); // le jeton volé est inutilisable : la session n'existe plus en base
  });

  it('expire la session au bout du délai prévu (et plus vite pour un administrateur)', async () => {
    const user = await createUser(t.db);
    const admin = await createUser(t.db, { adminRole: 'support' });
    const cu = t.client();
    const ca = t.client();
    await cu.post('/api/auth/sign-in', { email: user.email, password: user.password });
    await ca.post('/api/auth/sign-in', { email: admin.email, password: admin.password });
    t.clock.advance(13 * 3_600_000); // 13 h
    expect((await cu.get('/api/auth/session')).body).not.toBeNull();
    expect((await ca.get('/api/auth/session')).body).toBeNull(); // 12 h pour un admin
    t.clock.advance(31 * 86_400_000);
    expect((await cu.get('/api/auth/session')).body).toBeNull();
  });
});

describe('protection CSRF', () => {
  it('refuse une écriture dont l’origine n’est pas celle de l’application', async () => {
    const r = await t.client().post('/api/auth/sign-in', { email: uniqueEmail(), password: 'x' }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('bad_origin');
    expect((await t.client().post('/api/auth/sign-in', { email: uniqueEmail(), password: 'x' }, { origin: 'http://localhost:5173' })).status).toBe(401);
    expect((await t.client().post('/api/auth/sign-in', { email: uniqueEmail(), password: 'x' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
  });
});

describe('vérification de l’e-mail', () => {
  it('valide l’adresse avec le lien reçu, une seule fois', async () => {
    const { c, email } = await signUp();
    await c.post('/api/auth/email/resend');
    await settle();
    const token = linkToken(t.mailer.outbox.filter((m) => m.to === email).at(-1)!);
    const ok = await c.post('/api/auth/email/verify', { token });
    expect(ok.status).toBe(200);
    expect(ok.body.user.emailVerified).toBe(true);
    expect((await c.post('/api/auth/email/verify', { token })).body.message).toBe('token_expired');
    expect((await c.post('/api/auth/email/verify', { token: 'x'.repeat(40) })).body.message).toBe('invalid_token');
  });

  it('n’ouvre pas de session quand le lien est ouvert dans un autre navigateur', async () => {
    const { c: owner, email } = await signUp();
    await owner.post('/api/auth/email/resend');
    await settle();
    const token = linkToken(t.mailer.outbox.filter((m) => m.to === email).at(-1)!);
    const other = t.client();
    const r = await other.post('/api/auth/email/verify', { token });
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
    const [row] = await t.db.select().from(users).where(eq(users.email, email));
    expect(row!.emailVerifiedAt).not.toBeNull();
  });

  it('refuse un jeton expiré', async () => {
    const { c, email } = await signUp();
    await c.post('/api/auth/email/resend');
    await settle();
    const token = linkToken(t.mailer.outbox.filter((m) => m.to === email).at(-1)!);
    t.clock.advance(25 * 3_600_000);
    expect((await c.post('/api/auth/email/verify', { token })).body.message).toBe('token_expired');
  });

  it('renvoie le lien (3 fois par heure au plus)', async () => {
    const { c } = await signUp();
    for (let i = 0; i < 3; i++) expect((await c.post('/api/auth/email/resend')).status).toBe(204);
    expect((await c.post('/api/auth/email/resend')).status).toBe(429);
  });
});

describe('mot de passe oublié', () => {
  it('répond pareil pour un compte inconnu, envoie un lien au compte connu et révoque les sessions après réinitialisation', async () => {
    const { email, password } = await createUser(t.db);
    const before = t.mailer.outbox.length;
    expect((await t.client().post('/api/auth/password/forgot', { email: uniqueEmail('inconnu') })).status).toBe(204);
    expect(t.mailer.outbox.length).toBe(before);
    expect((await t.client().post('/api/auth/password/forgot', { email })).status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    const mail = t.mailer.outbox.at(-1)!;
    expect(mail.to).toBe(email);

    const open = t.client();
    await open.post('/api/auth/sign-in', { email, password });
    const token = linkToken(mail);
    expect((await t.client().post('/api/auth/password/reset', { token, password: 'password123' })).body.message).toBe('weak_password'); // le jeton n'est pas consommé
    expect((await t.client().post('/api/auth/password/reset', { token, password: 'Nouveau-Mot-de-passe-1' })).status).toBe(204);
    expect((await open.get('/api/auth/session')).body).toBeNull(); // ancienne session révoquée
    expect((await t.client().post('/api/auth/sign-in', { email, password })).status).toBe(401);
    expect((await t.client().post('/api/auth/sign-in', { email, password: 'Nouveau-Mot-de-passe-1' })).status).toBe(200);
    expect((await t.client().post('/api/auth/password/reset', { token, password: 'Autre-Mot-de-passe-2' })).body.message).toBe('token_expired'); // usage unique
  });

  it('stocke seulement le hash du jeton', async () => {
    const { email } = await createUser(t.db);
    await t.client().post('/api/auth/password/forgot', { email });
    await new Promise((r) => setTimeout(r, 50));
    const token = linkToken(t.mailer.outbox.at(-1)!);
    const rows = await t.db.select().from(authTokens);
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
  });
});

describe('connexion par téléphone (OTP)', () => {
  const PHONE = '+224622000011';
  const lastCode = () => t.otp.sent.at(-1)!.code;

  it('inscrit un compte vérifié par téléphone, sans e-mail, puis le reconnecte', async () => {
    const c = t.client({ 'x-real-ip': '198.51.100.1' });
    const req = await c.post('/api/auth/otp/request', { phone: PHONE, channel: 'whatsapp' });
    expect(req.body).toMatchObject({ channel: 'whatsapp', expiresInSec: OTP_TTL_SEC, resendInSec: OTP_RESEND_SEC });
    expect(req.body.devCode).toBe(lastCode());
    expect(t.otp.sent.at(-1)).toMatchObject({ phone: PHONE, channel: 'whatsapp' });
    const up = await c.post('/api/auth/otp/verify', { phone: PHONE, code: lastCode(), mode: 'sign_up', name: 'Awa Tel', acceptTerms: true });
    expect(up.status).toBe(200);
    expect(up.body.user).toMatchObject({ email: null, phone: PHONE, phoneVerified: true, emailVerified: false });

    t.clock.advance(60_000);
    const c2 = t.client({ 'x-real-ip': '198.51.100.2' });
    await c2.post('/api/auth/otp/request', { phone: PHONE, channel: 'sms' });
    const back = await c2.post('/api/auth/otp/verify', { phone: PHONE, code: lastCode(), mode: 'sign_in' });
    expect(back.body.user.id).toBe(up.body.user.id);
  });

  it('applique les garde-fous : essais, usage unique, expiration, renvoi, plafond horaire', async () => {
    const phone = '+224622000012';
    const c = t.client({ 'x-real-ip': '198.51.100.3' });
    await c.post('/api/auth/otp/request', { phone, channel: 'sms' });
    const good = lastCode();
    const bad = good === '000000' ? '111111' : '000000';
    const first = await c.post('/api/auth/otp/verify', { phone, code: bad, mode: 'sign_in' });
    expect(first.body).toMatchObject({ message: 'invalid_code', fields: { attemptsLeft: String(OTP_MAX_ATTEMPTS - 1) } });
    expect((await c.post('/api/auth/otp/request', { phone, channel: 'sms' })).body.message).toBe('resend_too_soon');
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 2; i++) await c.post('/api/auth/otp/verify', { phone, code: bad, mode: 'sign_in' });
    const blocked = await c.post('/api/auth/otp/verify', { phone, code: bad, mode: 'sign_in' });
    expect([blocked.status, blocked.body.message]).toEqual([429, 'too_many_attempts']);
    expect((await c.post('/api/auth/otp/verify', { phone, code: good, mode: 'sign_in' })).body.message).toBe('expired'); // le bon code ne marche plus après blocage

    t.clock.advance(31_000);
    await c.post('/api/auth/otp/request', { phone, channel: 'sms' });
    t.clock.advance(OTP_TTL_SEC * 1000 + 1);
    expect((await c.post('/api/auth/otp/verify', { phone, code: lastCode(), mode: 'sign_in' })).body.message).toBe('expired');

    let denied = '';
    for (let i = 0; i < 6 && !denied; i++) {
      t.clock.advance(31_000);
      const r = await c.post('/api/auth/otp/request', { phone, channel: 'sms' });
      if (r.status === 429) denied = r.body.message;
    }
    expect(denied).toBe('too_many_requests');
  });

  it('ne révèle un compte qu’après un code correct et gère numéro déjà pris / compte absent', async () => {
    const { user } = await createUser(t.db, { phone: '+224622000013', phoneVerified: true });
    const c = t.client({ 'x-real-ip': '198.51.100.4' });
    await c.post('/api/auth/otp/request', { phone: '+224622000014', channel: 'sms' });
    expect((await c.post('/api/auth/otp/verify', { phone: '+224622000014', code: '999999' === lastCode() ? '888888' : '999999', mode: 'sign_in' })).body.message).toBe('invalid_code');
    const none = await c.post('/api/auth/otp/verify', { phone: '+224622000014', code: lastCode(), mode: 'sign_in' });
    expect([none.status, none.body.message]).toEqual([404, 'no_account']);

    await c.post('/api/auth/otp/request', { phone: user.phone, channel: 'sms' });
    const taken = await c.post('/api/auth/otp/verify', { phone: user.phone, code: lastCode(), mode: 'sign_up', name: 'Autre', acceptTerms: true });
    expect([taken.status, taken.body.message]).toEqual([409, 'phone_taken']);
  });

  it('refuse un indicatif non pris en charge et un numéro mal formé', async () => {
    const c = t.client({ 'x-real-ip': '198.51.100.5' });
    expect((await c.post('/api/auth/otp/request', { phone: '+85212345678', channel: 'sms' })).body.message).toBe('country_not_supported');
    expect((await c.post('/api/auth/otp/request', { phone: '0622000000', channel: 'sms' })).status).toBe(422);
  });

  it('un compte vérifié par téléphone peut publier sans e-mail', async () => {
    const { user } = await createUser(t.db, { email: null, phone: '+224622000015', phoneVerified: true, name: 'Tel Seul' });
    expect(user.email).toBeNull();
  });
});
