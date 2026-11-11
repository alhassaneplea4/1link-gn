import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, lastMailCode, signUpByCode, type TestApp } from '../testing/harness.js';
import { createUser, uniqueEmail } from '../testing/fixtures.js';
import { authTokens, sessions, users } from '../db/schema.js';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_SEC, OTP_TTL_SEC } from '../services/accounts.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

/** Inscription réelle du produit : code reçu par e-mail (la route d'inscription par mot de passe n'existe plus). */
const signUp = (c = t.client(), email = uniqueEmail('new')) => signUpByCode(t, { client: c, email });
/** Compte hérité : créé sans preuve de l'adresse (ancienne inscription par mot de passe), puis connecté avec son mot de passe. */
async function legacyUnverified() {
  const u = await createUser(t.db, { emailVerified: false });
  const c = t.client();
  const r = await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
  expect(r.status).toBe(200);
  return { c, email: u.email!, password: u.password, id: u.user.id };
}
const settle = () => new Promise((r) => setTimeout(r, 40));
const linkToken = (mail: { text: string }) => decodeURIComponent(/token=([^\s&]+)/.exec(mail.text)![1]!);

describe('inscription par e-mail', () => {
  it('crée le compte avec la preuve de l’adresse : session (cookie httpOnly), adresse vérifiée, sans mot de passe', async () => {
    const { c, email, r } = await signUp();
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email, emailVerified: true, phoneVerified: false, hasPassword: false, plan: 'free', adminRole: null, onboardingDone: false });
    expect(r.body.permissions).toEqual([]);
    expect(r.body.entitlements.maxBlocks).toBe(12);
    expect(r.body.access).toMatchObject({ phase: 'free_trial', plan: 'free', locked: false, paidTrialAvailable: true });
    expect(r.headers.get('set-cookie')).toMatch(/onelink_session=.+HttpOnly.+SameSite=Lax/i);
    expect((await c.get('/api/auth/session')).body.user.email).toBe(email);
    await settle();
    expect(t.mailer.outbox.some((m) => m.to === email && m.subject === 'Bienvenue sur 1Link')).toBe(true);
    const [row] = await t.db.select().from(users).where(eq(users.email, email));
    expect(row!.passwordHash).toBeNull();
  });

  it('ne stocke jamais le jeton de session en clair', async () => {
    const { c } = await signUp();
    const cookie = c.cookie.split('=')[1]!;
    const rows = await t.db.select().from(sessions);
    expect(rows.some((s) => s.id === cookie)).toBe(false);
  });

  it('la route d’inscription par mot de passe a disparu : aucun compte ne se crée sans preuve de l’adresse', async () => {
    const email = uniqueEmail('sansPreuve');
    const r = await t.client().post('/api/auth/sign-up', { name: 'Pirate', email, password: 'MotDePasse-2026', acceptTerms: true });
    expect(r.status).toBe(404);
    expect(await t.db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
  });

  it('refuse un code incorrect et des adresses mal formées, y compris celles qui piègent l’analyseur d’adresses', async () => {
    const email = uniqueEmail('mauvaisCode');
    const c = t.client();
    await c.post('/api/auth/email-code/request', { email });
    expect((await c.post('/api/auth/email-code/verify', { email, code: '000000', acceptTerms: true })).status).toBe(422);
    for (const bad of ['pas-un-email', 'a<victime@gmail.com>.com', '"a>"@exemple.test', 'a@exemple.test,b@exemple.test', 'a b@exemple.test', 'a;b@exemple.test', 'a@exemple']) {
      expect((await t.client().post('/api/auth/email-code/request', { email: bad })).status, bad).toBe(422);
    }
  });
});

describe('pré-piratage de compte (adresse prise avant sa preuve)', () => {
  it('à la première preuve de l’adresse par code, le mot de passe, le téléphone et les sessions posés sans preuve sont effacés', async () => {
    const attacker = await legacyUnverified();
    await t.db.update(users).set({ phone: '+224622000111', phoneVerifiedAt: new Date(), twoFactorSms: true }).where(eq(users.id, attacker.id));
    expect((await attacker.c.get('/api/auth/session')).body.user.email).toBe(attacker.email);

    // La vraie propriétaire de l'adresse se connecte par code : elle prouve la possession de la boîte.
    const owner = t.client();
    await owner.post('/api/auth/email-code/request', { email: attacker.email });
    const login = await owner.post('/api/auth/email-code/verify', { email: attacker.email, code: lastMailCode(t, attacker.email), acceptTerms: true });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ emailVerified: true, hasPassword: false, phone: null, twoFactorSms: false });

    // L'attaquant n'a plus rien : ni session, ni mot de passe, ni téléphone.
    expect((await attacker.c.get('/api/auth/session')).body).toBeNull();
    expect((await t.client().post('/api/auth/sign-in', { email: attacker.email, password: attacker.password })).status).toBe(401);
    const [row] = await t.db.select().from(users).where(eq(users.id, attacker.id));
    expect(row).toMatchObject({ passwordHash: null, phone: null, phoneVerifiedAt: null, twoFactorSms: false });
    expect((await t.db.select().from(sessions).where(eq(sessions.userId, attacker.id))).length).toBe(1); // seulement celle de la propriétaire
  });

  it('un compte dont l’adresse est déjà vérifiée garde son mot de passe et ses sessions à la connexion par code', async () => {
    const u = await createUser(t.db);
    const other = t.client();
    await other.post('/api/auth/sign-in', { email: u.email, password: u.password });
    const c = t.client();
    await c.post('/api/auth/email-code/request', { email: u.email });
    expect((await c.post('/api/auth/email-code/verify', { email: u.email, code: lastMailCode(t, u.email!), acceptTerms: true })).status).toBe(200);
    expect((await other.get('/api/auth/session')).body.user.email).toBe(u.email);
    expect((await t.client().post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
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

describe('vérification de l’e-mail (comptes hérités)', () => {
  it('valide l’adresse avec le lien reçu, une seule fois, et efface ce qui avait été posé sans preuve', async () => {
    const { c, email, id } = await legacyUnverified();
    await c.post('/api/auth/email/resend');
    await settle();
    const token = linkToken(t.mailer.outbox.filter((m) => m.to === email).at(-1)!);
    const ok = await c.post('/api/auth/email/verify', { token });
    expect(ok.status).toBe(200);
    expect(ok.body).toBeNull(); // première preuve : les sessions sont fermées, la personne se reconnecte par code
    const [row] = await t.db.select().from(users).where(eq(users.id, id));
    expect(row!.emailVerifiedAt).not.toBeNull();
    expect(row!.passwordHash).toBeNull();
    expect((await c.get('/api/auth/session')).body).toBeNull();
    expect((await c.post('/api/auth/email/verify', { token })).body.message).toBe('token_expired');
    expect((await c.post('/api/auth/email/verify', { token: 'x'.repeat(40) })).body.message).toBe('invalid_token');
  });

  it('n’ouvre pas de session quand le lien est ouvert dans un autre navigateur', async () => {
    const { c: owner, email, id } = await legacyUnverified();
    await owner.post('/api/auth/email/resend');
    await settle();
    const token = linkToken(t.mailer.outbox.filter((m) => m.to === email).at(-1)!);
    const other = t.client();
    const r = await other.post('/api/auth/email/verify', { token });
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
    const [row] = await t.db.select().from(users).where(eq(users.id, id));
    expect(row!.emailVerifiedAt).not.toBeNull();
  });

  it('refuse un jeton expiré', async () => {
    const { c, email } = await legacyUnverified();
    await c.post('/api/auth/email/resend');
    await settle();
    const token = linkToken(t.mailer.outbox.filter((m) => m.to === email).at(-1)!);
    t.clock.advance(25 * 3_600_000);
    expect((await c.post('/api/auth/email/verify', { token })).body.message).toBe('token_expired');
  });

  it('renvoie le lien (3 fois par heure au plus)', async () => {
    const { c } = await legacyUnverified();
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
