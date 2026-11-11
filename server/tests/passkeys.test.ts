import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp, type TestClient } from '../testing/harness.js';
import { createUser, type UserFixture } from '../testing/fixtures.js';
import { VirtualAuthenticator } from '../testing/webauthn.js';
import { passkeys, sessions, users, webauthnChallenges } from '../db/schema.js';
import { encryptSecret } from '../lib/crypto.js';
import { relyingParty } from '../services/passkeys.js';

/**
 * Clés d'accès : un authentificateur VIRTUEL fabrique de vraies attestations et assertions (clé ECDSA, signatures DER, CBOR) que la
 * bibliothèque serveur vérifie comme celles d'un navigateur. Rien n'est simulé côté serveur.
 */
let t: TestApp;
beforeAll(async () => void (t = await createTestApp({ overrides: { adminRequireMfa: true } })));
afterAll(async () => t.close());

const ORIGIN = 'http://localhost:5173';
const RP_ID = 'localhost';
const newKey = (userVerification = true) => new VirtualAuthenticator({ origin: ORIGIN, rpId: RP_ID, userVerification });
let n = 0;
const ip = () => ({ 'x-real-ip': `198.18.100.${(n++ % 200) + 1}` });
const settle = () => new Promise((r) => setTimeout(r, 50));

async function signedIn(f: UserFixture = {}) {
  const u = await createUser(t.db, f);
  const c = t.client(ip());
  expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
  return { ...u, c };
}
async function enroll(c: TestClient, password: string, key = newKey(), name = 'Mon téléphone') {
  const opt = await c.post('/api/me/passkeys/options', { password });
  expect(opt.status).toBe(200);
  const r = await c.post('/api/me/passkeys', { handle: opt.body.handle, response: key.register(opt.body.options), name });
  return { key, opt, r };
}
async function login(c: TestClient, key: VirtualAuthenticator, over: Parameters<VirtualAuthenticator['authenticate']>[1] = {}) {
  const o = await c.post('/api/auth/passkey/options');
  expect(o.status).toBe(200);
  return { o, r: await c.post('/api/auth/passkey/verify', { handle: o.body.handle, response: key.authenticate(o.body.options, over) }) };
}

describe('site de confiance', () => {
  it('déduit l’identifiant et l’origine de l’URL publique configurée, jamais de la requête', () => {
    expect(relyingParty(t.deps)).toMatchObject({ id: 'localhost', origins: ['http://localhost:5173'] });
  });
});

describe('enrôlement', () => {
  it('exige la preuve d’identité du titulaire, puis ajoute la clé : session à second facteur, e-mail d’avis, aucune clé privée stockée', async () => {
    const u = await signedIn();
    expect((await u.c.post('/api/me/passkeys/options', {})).body.message).toBe('confirmation_required');
    expect((await u.c.post('/api/me/passkeys/options', { password: 'Mauvais-mot-de-passe' })).body.message).toBe('wrong_password');
    expect((await t.client().post('/api/me/passkeys/options', {})).status).toBe(401);

    const { key, opt, r } = await enroll(u.c, u.password, newKey(), '  Mon <b>téléphone</b>\n');
    expect(opt.body.options).toMatchObject({
      rp: { id: RP_ID, name: '1Link' }, attestation: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    expect(r.status).toBe(201);
    expect(r.body.passkey).toMatchObject({ id: key.id, deviceType: 'singleDevice', backedUp: false }); // l'authentificateur virtuel ne déclare pas « sauvegardable »
    expect(r.body.passkey.name).not.toMatch(/[\n\u0000]/);
    expect(r.body.session.adminMfaRequired).toBe(false);
    const [row] = await t.db.select().from(passkeys).where(eq(passkeys.userId, u.user.id));
    expect(row!.publicKey).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain('PRIVATE');
    const [s] = await t.db.select().from(sessions).where(eq(sessions.userId, u.user.id));
    expect(s!.authFactor).toBe('mfa');
    await settle();
    expect(t.mailer.outbox.some((m) => m.to === u.email && /clé d’accès a été ajoutée/.test(m.subject))).toBe(true);
    const list = (await u.c.get('/api/me/passkeys')).body as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]!).sort()).toEqual(['backedUp', 'createdAt', 'deviceType', 'id', 'lastUsedAt', 'name']);
  });

  it('refuse un défi rejoué, expiré, ou émis pour un autre compte', async () => {
    const a = await signedIn();
    const b = await signedIn();
    const opt = await a.c.post('/api/me/passkeys/options', { password: a.password });
    const key = newKey();
    const response = key.register(opt.body.options);
    // Le défi d'A ne sert pas à B.
    expect((await b.c.post('/api/me/passkeys', { handle: opt.body.handle, response })).body.message).toBe('passkey_challenge_expired');
    // Il est encore valable pour A, mais une seule fois.
    expect((await a.c.post('/api/me/passkeys', { handle: opt.body.handle, response })).status).toBe(201);
    expect((await a.c.post('/api/me/passkeys', { handle: opt.body.handle, response })).body.message).toBe('passkey_challenge_expired');
    // Expiré au bout de 5 minutes.
    const late = await a.c.post('/api/me/passkeys/options', { password: a.password });
    t.clock.advance(6 * 60_000);
    expect((await a.c.post('/api/me/passkeys', { handle: late.body.handle, response: newKey().register(late.body.options) })).body.message).toBe('passkey_challenge_expired');
  });

  it('refuse une mauvaise origine, un mauvais défi et une clé dont l’appareil n’a pas vérifié l’utilisateur', async () => {
    const u = await signedIn();
    const cases: Array<[string, (o: { body: any }) => unknown]> = [
      ['origine étrangère', (o) => newKey().register(o.body.options, { origin: 'https://evil.example' })],
      ['défi falsifié', (o) => newKey().register(o.body.options, { challenge: Buffer.from('autre-defi').toString('base64url') })],
      ['sans vérification de l’utilisateur', (o) => newKey(false).register(o.body.options)],
    ];
    for (const [label, build] of cases) {
      const opt = await u.c.post('/api/me/passkeys/options', { password: u.password });
      const r = await u.c.post('/api/me/passkeys', { handle: opt.body.handle, response: build(opt) });
      expect([label, r.status, r.body.message]).toEqual([label, 422, 'passkey_invalid']);
    }
    expect(await t.db.select().from(passkeys).where(eq(passkeys.userId, u.user.id))).toHaveLength(0);
  });

  it('n’enregistre pas deux fois la même clé et plafonne à 10 clés par compte', async () => {
    const u = await signedIn();
    const first = await enroll(u.c, u.password);
    const again = await u.c.post('/api/me/passkeys/options', { password: u.password });
    expect(again.body.options.excludeCredentials.map((c: { id: string }) => c.id)).toEqual([first.key.id]);
    const full = await signedIn();
    for (let i = 0; i < 10; i++) await t.db.insert(passkeys).values({ id: `k${i}-${full.user.id}`, userId: full.user.id, publicKey: 'x' });
    expect((await full.c.post('/api/me/passkeys/options', { password: full.password })).body.message).toBe('passkey_limit');
  });
});

describe('connexion par clé d’accès', () => {
  it('ouvre une session sans adresse ni mot de passe, de facteur « passkey », et met à jour le compteur', async () => {
    const owner = await signedIn();
    const { key } = await enroll(owner.c, owner.password);
    const anon = t.client(ip());
    const { r } = await login(anon, key);
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email: owner.email });
    expect(r.headers.get('set-cookie')).toMatch(/onelink_session=.+HttpOnly/i);
    expect((await anon.get('/api/auth/session')).body.user.email).toBe(owner.email);
    const rows = await t.db.select().from(sessions).where(eq(sessions.userId, owner.user.id));
    expect(rows.map((s) => s.authFactor).sort()).toEqual(['mfa', 'passkey']);
    const [row] = await t.db.select().from(passkeys).where(eq(passkeys.id, key.id));
    expect(row!.counter).toBe(1);
    expect(row!.lastUsedAt).not.toBeNull();
  });

  it('un administrateur connecté par clé d’accès entre dans l’Admin Center (deux facteurs en un)', async () => {
    const a = await signedIn({ adminRole: 'super_admin' });
    expect((await a.c.get('/api/admin/users')).status).toBe(403); // session à un seul facteur
    const { key } = await enroll(a.c, a.password);
    expect((await a.c.get('/api/admin/users')).status).toBe(200); // l'enrôlement a élevé CETTE session
    const fresh = t.client(ip());
    const { r } = await login(fresh, key);
    expect(r.body.adminMfaRequired).toBe(false);
    expect((await fresh.get('/api/admin/users')).status).toBe(200);
  });

  it('court-circuite la seconde étape : la clé vaut déjà deux facteurs, même si l’application d’authentification est active', async () => {
    const u = await signedIn();
    const { key } = await enroll(u.c, u.password);
    await t.db.update(users).set({ totpSecret: encryptSecret(t.deps.config.secret, 'JBSWY3DPEHPK3PXP'), totpEnabledAt: new Date() }).where(eq(users.id, u.user.id));
    const viaPassword = await t.client(ip()).post('/api/auth/sign-in', { email: u.email, password: u.password });
    expect(viaPassword.body.twoFactor).toBeDefined(); // le mot de passe, lui, reste suivi du code de l'application
    const { r } = await login(t.client(ip()), key);
    expect(r.status).toBe(200);
    expect(r.body.twoFactor).toBeUndefined();
  });

  it('refuse un défi rejoué, une assertion pour un autre défi, un défi expiré et un défi inconnu', async () => {
    const u = await signedIn();
    const { key } = await enroll(u.c, u.password);
    const c = t.client(ip());
    const o = await c.post('/api/auth/passkey/options');
    const response = key.authenticate(o.body.options);
    expect((await c.post('/api/auth/passkey/verify', { handle: o.body.handle, response })).status).toBe(200);
    expect((await t.client(ip()).post('/api/auth/passkey/verify', { handle: o.body.handle, response })).body.message).toBe('invalid_challenge'); // rejoué
    const o2 = await c.post('/api/auth/passkey/options');
    const stale = key.authenticate(o.body.options); // signée pour l'ancien défi
    expect((await t.client(ip()).post('/api/auth/passkey/verify', { handle: o2.body.handle, response: stale })).body.message).toBe('invalid_passkey');
    const o3 = await c.post('/api/auth/passkey/options');
    t.clock.advance(6 * 60_000);
    expect((await t.client(ip()).post('/api/auth/passkey/verify', { handle: o3.body.handle, response: key.authenticate(o3.body.options) })).body.message).toBe('invalid_challenge');
    expect((await t.client(ip()).post('/api/auth/passkey/verify', { handle: 'wc_inconnu', response })).status).toBe(401);
  });

  it('refuse une mauvaise origine, une clé inconnue, une signature d’une autre clé et l’absence de vérification de l’utilisateur', async () => {
    const u = await signedIn();
    const { key } = await enroll(u.c, u.password);
    expect((await login(t.client(ip()), key, { origin: 'https://evil.example' })).r.body.message).toBe('invalid_passkey');
    expect((await login(t.client(ip()), newKey())).r.body.message).toBe('invalid_passkey'); // clé jamais enregistrée
    const impostor = newKey();
    Object.assign(impostor, { credentialId: key.credentialId }); // même identifiant, autre clé privée
    expect((await login(t.client(ip()), impostor)).r.body.message).toBe('invalid_passkey');
    key.opts.userVerification = false;
    expect((await login(t.client(ip()), key)).r.body.message).toBe('invalid_passkey');
    key.opts.userVerification = true;
    expect((await login(t.client(ip()), key)).r.status).toBe(200); // la vraie clé, avec vérification, passe toujours
  });

  it('refuse un compteur qui régresse (clé clonée) sans toucher au compteur stocké', async () => {
    const u = await signedIn();
    const { key } = await enroll(u.c, u.password);
    expect((await login(t.client(ip()), key, { counter: 5 })).r.status).toBe(200);
    expect((await login(t.client(ip()), key, { counter: 3 })).r.body.message).toBe('invalid_passkey');
    expect((await t.db.select().from(passkeys).where(eq(passkeys.id, key.id)))[0]!.counter).toBe(5);
    expect((await login(t.client(ip()), key, { counter: 6 })).r.status).toBe(200);
  });

  it('refuse un identifiant d’utilisateur qui n’est pas celui du propriétaire de la clé', async () => {
    const u = await signedIn();
    const { key } = await enroll(u.c, u.password);
    expect((await login(t.client(ip()), key, { userHandle: Buffer.from('usr_autre') })).r.body.message).toBe('invalid_passkey');
  });

  it('un compte suspendu ne se connecte pas, et ses clés ne dévoilent rien de plus', async () => {
    const u = await signedIn();
    const { key } = await enroll(u.c, u.password);
    await t.db.update(users).set({ status: 'suspended' }).where(eq(users.id, u.user.id));
    const { r } = await login(t.client(ip()), key);
    expect([r.status, r.body.message]).toEqual([403, 'account_suspended']);
  });

  it('les défis de connexion sont stockés côté serveur, à usage unique', async () => {
    const before = (await t.db.select().from(webauthnChallenges)).length;
    const o = await t.client(ip()).post('/api/auth/passkey/options');
    expect(o.body.options.userVerification).toBe('required');
    expect(o.body.options.allowCredentials ?? []).toEqual([]); // aucune fuite sur l'existence d'un compte
    expect((await t.db.select().from(webauthnChallenges)).length).toBe(before + 1);
  });
});

describe('retrait', () => {
  it('exige la preuve d’identité, retire la clé (elle ne connecte plus) et prévient par e-mail', async () => {
    const u = await signedIn();
    const { key } = await enroll(u.c, u.password);
    expect((await u.c.post(`/api/me/passkeys/${key.id}/delete`, {})).body.message).toBe('confirmation_required');
    expect((await u.c.post(`/api/me/passkeys/${key.id}/delete`, { password: 'Mauvais-mot-de-passe' })).body.message).toBe('wrong_password');
    expect((await u.c.post(`/api/me/passkeys/${key.id}/delete`, { password: u.password })).status).toBe(204);
    expect((await u.c.get('/api/me/passkeys')).body).toEqual([]);
    expect((await login(t.client(ip()), key)).r.body.message).toBe('invalid_passkey');
    await settle();
    expect(t.mailer.outbox.some((m) => m.to === u.email && /clé d’accès a été retirée/.test(m.subject))).toBe(true);
  });

  it('ne retire jamais la clé d’un autre compte', async () => {
    const victim = await signedIn();
    const { key } = await enroll(victim.c, victim.password);
    const attacker = await signedIn();
    expect((await attacker.c.post(`/api/me/passkeys/${key.id}/delete`, { password: attacker.password })).status).toBe(404);
    expect((await victim.c.get('/api/me/passkeys')).body).toHaveLength(1);
  });
});
