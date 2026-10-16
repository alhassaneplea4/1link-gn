import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, uniqueEmail } from '../testing/fixtures.js';
import { users } from '../db/schema.js';
import { totpAt, base32Decode, base32Encode, verifyTotp } from '../lib/totp.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let n = 0;
const ip = () => ({ 'x-real-ip': `198.18.0.${(n++ % 200) + 1}` });
const settle = () => new Promise((r) => setTimeout(r, 60));
const wait = (s = 31) => t.clock.advance(s * 1000);

/** Dernier code reçu par e-mail (objet « 123456 est votre code 1Link »). */
function mailCode(to: string): string {
  const m = t.mailer.outbox.filter((x) => x.to === to && /est votre code 1Link/.test(x.subject)).at(-1);
  return /(\d{6}) est votre code 1Link/.exec(m!.subject)![1]!;
}

async function signUpByEmail() {
  const email = uniqueEmail('code');
  const c = t.client(ip());
  const req = await c.post('/api/auth/email-code/request', { email });
  expect(req.status).toBe(200);
  const up = await c.post('/api/auth/email-code/verify', { email, code: mailCode(email), acceptTerms: true });
  expect(up.status).toBe(200);
  return { email, c, session: up.body };
}

describe('inscription et connexion par code reçu par e-mail', () => {
  it('crée le compte avec la seule adresse : actif, adresse vérifiée, sans mot de passe, essai de 7 jours', async () => {
    const { email, session } = await signUpByEmail();
    expect(session.user).toMatchObject({ email, emailVerified: true, hasPassword: false, onboardingDone: false, plan: 'free', mfa: { sms: false, email: false, totp: false } });
    expect(session.access).toMatchObject({ phase: 'free_trial', locked: false });
    expect(session.user.name.length).toBeGreaterThan(0);
    await settle();
    expect(t.mailer.outbox.some((m) => m.to === email && m.subject === 'Bienvenue sur 1Link')).toBe(true);
  });

  it('exige les conditions, refuse un mauvais code (5 essais) et ne révèle pas si l’adresse a un compte', async () => {
    const email = uniqueEmail('mauvais');
    const c = t.client(ip());
    await c.post('/api/auth/email-code/request', { email });
    expect((await c.post('/api/auth/email-code/verify', { email, code: mailCode(email) })).status).toBe(422); // conditions non acceptées
    const wrong = mailCode(email) === '000000' ? '111111' : '000000';
    const r = await c.post('/api/auth/email-code/verify', { email, code: wrong, acceptTerms: true });
    expect([r.status, r.body.message, r.body.fields.attemptsLeft]).toEqual([422, 'invalid_code', '4']);

    // Même réponse pour une adresse qui a déjà un compte.
    const known = await createUser(t.db, {});
    const a = await t.client(ip()).post('/api/auth/email-code/request', { email: known.email });
    const b = await t.client(ip()).post('/api/auth/email-code/request', { email: uniqueEmail('inconnu') });
    expect(Object.keys(a.body).sort()).toEqual(Object.keys(b.body).sort());
  });

  it('connecte un compte existant (même sans mot de passe) et limite le renvoi à un code toutes les 30 secondes', async () => {
    const { email } = await signUpByEmail();
    const c = t.client(ip());
    wait();
    expect((await c.post('/api/auth/email-code/request', { email })).status).toBe(200);
    expect((await c.post('/api/auth/email-code/request', { email })).body.message).toBe('resend_too_soon');
    const login = await c.post('/api/auth/email-code/verify', { email, code: mailCode(email), acceptTerms: true });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(email);
    expect((await c.get('/api/auth/session')).body.user.email).toBe(email);
  });

  it('un compte suspendu ne reçoit pas de code et ne se connecte pas', async () => {
    const u = await createUser(t.db, { suspended: true });
    const c = t.client(ip());
    const before = t.mailer.outbox.length;
    expect((await c.post('/api/auth/email-code/request', { email: u.email })).status).toBe(200);
    expect(t.mailer.outbox.length).toBe(before);
  });
});

describe('vérification en deux étapes (désactivée par défaut)', () => {
  it('un compte neuf n’a aucune méthode active : la connexion ouvre directement la session', async () => {
    const u = await createUser(t.db, { phone: '+224622000301', phoneVerified: true });
    const c = t.client(ip());
    const r = await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    expect(r.body.user).toBeDefined();
    expect(r.body.twoFactor).toBeUndefined();
    expect((await c.get('/api/me/mfa')).body).toMatchObject({ sms: { enabled: false, phoneVerified: true }, email: { enabled: false }, totp: { enabled: false }, recoveryLeft: 0 });
  });

  it('par e-mail : activation confirmée par le mot de passe, code exigé après le mot de passe, jamais redemandé après un code e-mail', async () => {
    const u = await createUser(t.db, {});
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    expect((await c.post('/api/me/mfa/email', { enabled: true })).status).toBe(422); // aucune preuve d'identité
    expect((await c.post('/api/me/mfa/email', { enabled: true, password: 'Mauvais-mot-de-passe' })).body.message).toBe('wrong_password');
    const on = await c.post('/api/me/mfa/email', { enabled: true, password: u.password });
    expect(on.body.user.mfa).toEqual({ sms: false, email: true, totp: false });

    const c2 = t.client(ip());
    const step1 = await c2.post('/api/auth/sign-in', { email: u.email, password: u.password });
    expect(step1.body.user).toBeUndefined();
    expect(step1.body.twoFactor).toMatchObject({ methods: ['email'], method: 'email' });
    expect((await c2.get('/api/auth/session')).body).toBeNull(); // la première étape seule n'ouvre rien
    const wrong = mailCode(u.email!) === '000000' ? '111111' : '000000';
    expect((await c2.post('/api/auth/sign-in/mfa', { challenge: step1.body.twoFactor.challenge, method: 'email', code: wrong })).body.message).toBe('invalid_code');
    const done = await c2.post('/api/auth/sign-in/mfa', { challenge: step1.body.twoFactor.challenge, method: 'email', code: mailCode(u.email!) });
    expect(done.status).toBe(200);
    expect(done.body.user.email).toBe(u.email);

    // Connexion par code e-mail : la première étape était déjà l'e-mail, pas de redemande.
    wait();
    const c3 = t.client(ip());
    await c3.post('/api/auth/email-code/request', { email: u.email });
    const direct = await c3.post('/api/auth/email-code/verify', { email: u.email, code: mailCode(u.email!), acceptTerms: true });
    expect(direct.body.user?.email).toBe(u.email);

    const off = await c.post('/api/me/mfa/email', { enabled: false, password: u.password });
    expect(off.body.user.mfa.email).toBe(false);
  });

  it('par SMS : numéro vérifié requis, code envoyé à la connexion, renvoi possible', async () => {
    const noPhone = await createUser(t.db, {});
    const c0 = t.client(ip());
    await c0.post('/api/auth/sign-in', { email: noPhone.email, password: noPhone.password });
    expect((await c0.post('/api/me/2fa', { enabled: true, password: noPhone.password })).body.message).toBe('phone_required');

    const u = await createUser(t.db, { phone: '+224622000302', phoneVerified: true });
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    expect((await c.post('/api/me/2fa', { enabled: true, password: u.password })).body.user.mfa.sms).toBe(true);

    const c2 = t.client(ip());
    const step1 = await c2.post('/api/auth/sign-in', { email: u.email, password: u.password });
    expect(step1.body.twoFactor).toMatchObject({ methods: ['sms'], method: 'sms', phoneMasked: expect.any(String) });
    const sms = t.otp.sent.at(-1)!;
    expect(sms.phone).toBe('+224622000302');
    wait();
    expect((await c2.post('/api/auth/sign-in/mfa/send', { challenge: step1.body.twoFactor.challenge, method: 'sms' })).status).toBe(200);
    const ok = await c2.post('/api/auth/sign-in/mfa', { challenge: step1.body.twoFactor.challenge, method: 'sms', code: t.otp.sent.at(-1)!.code });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(u.email);
  });

  it('application d’authentification : configuration en deux temps, codes de secours à usage unique, et connexion', async () => {
    const u = await createUser(t.db, {});
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });

    expect((await c.post('/api/me/mfa/totp/setup', {})).status).toBe(422);
    const setup = await c.post('/api/me/mfa/totp/setup', { password: u.password });
    expect(setup.body.uri).toMatch(/^otpauth:\/\/totp\/1Link%3A.+secret=[A-Z2-7]+&issuer=1Link/);
    const secret = setup.body.secret as string;
    // Le secret est chiffré au repos.
    const [row] = await t.db.select().from(users).where(eq(users.id, u.user.id));
    expect(row!.totpSecret).not.toContain(secret);
    expect(decryptSecret(t.deps.config.secret, row!.totpSecret!)).toBe(secret);
    expect(row!.totpEnabledAt).toBeNull();

    expect((await c.post('/api/me/mfa/totp/enable', { code: '000000' })).body.message).toBe('invalid_code');
    const enabled = await c.post('/api/me/mfa/totp/enable', { code: totpAt(secret, t.clock.now().getTime()) });
    expect(enabled.status).toBe(200);
    expect(enabled.body.session.user.mfa.totp).toBe(true);
    const codes = enabled.body.recoveryCodes as string[];
    expect(codes).toHaveLength(8);
    expect(codes[0]).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    expect((await c.get('/api/me/mfa')).body.recoveryLeft).toBe(8);

    const c2 = t.client(ip());
    const step1 = await c2.post('/api/auth/sign-in', { email: u.email, password: u.password });
    expect(step1.body.twoFactor).toMatchObject({ methods: ['totp'], method: 'totp' });
    const ch = step1.body.twoFactor.challenge as string;
    expect((await c2.post('/api/auth/sign-in/mfa', { challenge: ch, method: 'totp', code: '123456' })).status).toBe(422);
    const ok = await c2.post('/api/auth/sign-in/mfa', { challenge: ch, method: 'totp', code: totpAt(secret, t.clock.now().getTime()) });
    expect(ok.status).toBe(200);

    // Code de secours : accepté une fois seulement.
    const c3 = t.client(ip());
    const s3 = (await c3.post('/api/auth/sign-in', { email: u.email, password: u.password })).body.twoFactor.challenge as string;
    expect((await c3.post('/api/auth/sign-in/mfa', { challenge: s3, method: 'recovery', code: codes[0] })).status).toBe(200);
    const c4 = t.client(ip());
    const s4 = (await c4.post('/api/auth/sign-in', { email: u.email, password: u.password })).body.twoFactor.challenge as string;
    expect((await c4.post('/api/auth/sign-in/mfa', { challenge: s4, method: 'recovery', code: codes[0] })).status).toBe(422);
    expect((await c4.post('/api/auth/sign-in/mfa', { challenge: s4, method: 'recovery', code: codes[1]!.toLowerCase() })).status).toBe(200);

    // Désactivation : preuve d'identité obligatoire.
    expect((await c.post('/api/me/mfa/totp/disable', {})).status).toBe(422);
    const off = await c.post('/api/me/mfa/totp/disable', { password: u.password });
    expect(off.body.user.mfa.totp).toBe(false);
    const [after] = await t.db.select().from(users).where(eq(users.id, u.user.id));
    expect([after!.totpSecret, after!.totpEnabledAt, after!.recoveryCodes]).toEqual([null, null, null]);
  });

  it('plusieurs méthodes : l’application est proposée en premier, les autres restent disponibles', async () => {
    const u = await createUser(t.db, { phone: '+224622000303', phoneVerified: true });
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    await c.post('/api/me/2fa', { enabled: true, password: u.password });
    await c.post('/api/me/mfa/email', { enabled: true, password: u.password });
    const secret = (await c.post('/api/me/mfa/totp/setup', { password: u.password })).body.secret as string;
    await c.post('/api/me/mfa/totp/enable', { code: totpAt(secret, t.clock.now().getTime()) });
    const step1 = await t.client(ip()).post('/api/auth/sign-in', { email: u.email, password: u.password });
    expect(step1.body.twoFactor.method).toBe('totp');
    expect(step1.body.twoFactor.methods.sort()).toEqual(['email', 'sms', 'totp']);
  });

  it('l’ancienne route SMS /sign-in/2fa continue de fonctionner', async () => {
    const u = await createUser(t.db, { phone: '+224622000304', phoneVerified: true });
    const c = t.client(ip());
    await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    await c.post('/api/me/2fa', { enabled: true, password: u.password });
    const c2 = t.client(ip());
    const step1 = await c2.post('/api/auth/sign-in', { email: u.email, password: u.password });
    const ok = await c2.post('/api/auth/sign-in/2fa', { challenge: step1.body.twoFactor.challenge, code: t.otp.sent.at(-1)!.code });
    expect(ok.status).toBe(200);
  });
});

describe('mot de passe d’un compte créé par code', () => {
  it('se définit avec un code envoyé par e-mail, puis se change avec l’ancien mot de passe', async () => {
    const { email, c } = await signUpByEmail();
    wait(); wait();
    expect((await c.post('/api/me/password', { newPassword: 'Un-mot-de-passe-solide-1' })).status).toBe(422);
    expect((await c.post('/api/me/identity/code')).body).toMatchObject({ via: 'email' });
    expect((await c.post('/api/me/password', { newPassword: 'abc', code: mailCode(email) })).status).toBe(422);
    wait();
    await c.post('/api/me/identity/code');
    const set = await c.post('/api/me/password', { newPassword: 'Un-mot-de-passe-solide-1', code: mailCode(email) });
    expect(set.body.user.hasPassword).toBe(true);
    expect((await t.client(ip()).post('/api/auth/sign-in', { email, password: 'Un-mot-de-passe-solide-1' })).status).toBe(200);
    expect((await c.post('/api/me/password', { newPassword: 'Un-autre-mot-de-passe-2', password: 'Mauvais-mot-de-passe' })).body.message).toBe('wrong_password');
    expect((await c.post('/api/me/password', { newPassword: 'Un-autre-mot-de-passe-2', password: 'Un-mot-de-passe-solide-1' })).status).toBe(200);
  });
});

describe('TOTP et chiffrement (primitives)', () => {
  it('respecte les vecteurs de test RFC 6238 (SHA-1)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpAt(secret, 59_000)).toBe('287082');
    expect(totpAt(secret, 1_111_111_109_000)).toBe('081804');
    expect(totpAt(secret, 1_234_567_890_000)).toBe('005924');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    expect(verifyTotp(secret, '287082', new Date(59_000 + 25_000))).toBe(true); // pas voisin accepté
    expect(verifyTotp(secret, '287082', new Date(59_000 + 120_000))).toBe(false);
  });
  it('chiffre et déchiffre un secret, et refuse une altération', () => {
    const enc = encryptSecret('clé-de-test', 'JBSWY3DPEHPK3PXP');
    expect(enc).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret('clé-de-test', enc)).toBe('JBSWY3DPEHPK3PXP');
    expect(decryptSecret('autre-clé', enc)).toBeNull();
    expect(decryptSecret('clé-de-test', `${enc}x`)).toBeNull();
  });
});
