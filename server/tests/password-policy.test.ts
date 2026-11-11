import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, FIXTURE_PASSWORD } from '../testing/fixtures.js';
import { pwnedCount } from '../lib/pwned.js';

/**
 * Mots de passe compromis : le service Pwned Passwords est simulé (aucun appel réseau). On vérifie ce qui compte :
 * seul le PRÉFIXE de l'empreinte sort du serveur, un mot de passe compromis est refusé AVANT de consommer le jeton,
 * et une panne du service ne bloque jamais personne.
 */
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase();
const COMPROMISED = 'Mot-de-passe-compromis-2026';
const FRESH = 'Un-mot-de-passe-tout-neuf-7391';
const stub = (listed: string[] = [], opts: { status?: number; fail?: boolean } = {}) => {
  const fn = vi.fn(async (url: string | URL) => {
    if (opts.fail) throw new Error('réseau coupé');
    const prefix = String(url).split('/').pop()!;
    const lines = [`${'A'.repeat(35)}:0`, ...listed.filter((p) => sha1(p).startsWith(prefix)).map((p) => `${sha1(p).slice(5)}:4242`), `${'B'.repeat(35)}:0`];
    return new Response(lines.join('\r\n'), { status: opts.status ?? 200 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

let t: TestApp;
beforeAll(async () => void (t = await createTestApp({ overrides: { pwnedPasswords: true } })));
afterAll(async () => t.close());
afterEach(() => vi.unstubAllGlobals());

let n = 0;
const ip = () => ({ 'x-real-ip': `198.18.70.${(n++ % 200) + 1}` });
async function signedIn() {
  const u = await createUser(t.db);
  const c = t.client(ip());
  expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
  return { ...u, c };
}

describe('client Pwned Passwords', () => {
  it('n’envoie que les 5 premiers caractères de l’empreinte SHA-1, jamais le mot de passe', async () => {
    const fetchSpy = stub([COMPROMISED]);
    expect(await pwnedCount(COMPROMISED)).toBe(4242);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1(COMPROMISED).slice(0, 5)}`);
    expect(url).not.toContain(COMPROMISED);
    expect(url).not.toContain(sha1(COMPROMISED).slice(5));
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true');
  });

  it('ignore les lignes de remplissage (décompte 0) et répond 0 pour un mot de passe inconnu', async () => {
    stub([]);
    expect(await pwnedCount(FRESH)).toBe(0);
  });

  it('répond « inconnu » (null) quand le service échoue, est lent ou renvoie une erreur', async () => {
    stub([], { fail: true });
    expect(await pwnedCount(FRESH)).toBeNull();
    stub([], { status: 503 });
    expect(await pwnedCount(FRESH)).toBeNull();
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('délai dépassé'))))));
    expect(await pwnedCount(FRESH, { timeoutMs: 20 })).toBeNull();
  });
});

describe('définir ou changer le mot de passe depuis Sécurité', () => {
  it('refuse un mot de passe compromis, sans rien changer', async () => {
    const { c, email } = await signedIn();
    stub([COMPROMISED]);
    const r = await c.post('/api/me/password', { newPassword: COMPROMISED, password: FIXTURE_PASSWORD });
    expect([r.status, r.body.message]).toEqual([422, 'pwned_password']);
    expect((await t.client(ip()).post('/api/auth/sign-in', { email, password: FIXTURE_PASSWORD })).status).toBe(200); // l'ancien mot de passe fonctionne toujours
    expect((await t.client(ip()).post('/api/auth/sign-in', { email, password: COMPROMISED })).status).toBe(401);
  });

  it('accepte un mot de passe absent des fuites', async () => {
    const { c, email } = await signedIn();
    stub([COMPROMISED]);
    expect((await c.post('/api/me/password', { newPassword: FRESH, password: FIXTURE_PASSWORD })).status).toBe(200);
    expect((await t.client(ip()).post('/api/auth/sign-in', { email, password: FRESH })).status).toBe(200);
  });

  it('ne bloque jamais si le service est injoignable (le garde-fou n’est pas une dépendance)', async () => {
    const { c } = await signedIn();
    stub([COMPROMISED], { fail: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect((await c.post('/api/me/password', { newPassword: COMPROMISED, password: FIXTURE_PASSWORD })).status).toBe(200);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('réinitialisation du mot de passe', () => {
  const tokenOf = (to: string) => decodeURIComponent(/token=([^\s&]+)/.exec(t.mailer.outbox.filter((m) => m.to === to && /Réinitialisez/.test(m.subject)).at(-1)!.text)![1]!);

  it('refuse un mot de passe compromis AVANT de consommer le lien : la personne peut corriger sans le perdre', async () => {
    const u = await createUser(t.db);
    await t.client(ip()).post('/api/auth/password/forgot', { email: u.email });
    await new Promise((r) => setTimeout(r, 50));
    const token = tokenOf(u.email!);
    stub([COMPROMISED]);
    const refused = await t.client(ip()).post('/api/auth/password/reset', { token, password: COMPROMISED });
    expect([refused.status, refused.body.message]).toEqual([422, 'pwned_password']);
    expect((await t.client(ip()).post('/api/auth/password/reset', { token, password: FRESH })).status).toBe(204); // le même lien sert encore
    expect((await t.client(ip()).post('/api/auth/sign-in', { email: u.email, password: FRESH })).status).toBe(200);
  });
});

describe('désactivation', () => {
  it('sans l’option (configuration de test par défaut), aucun appel n’est fait', async () => {
    const quiet = await createTestApp();
    try {
      const fetchSpy = stub([COMPROMISED]);
      const u = await createUser(quiet.db);
      const c = quiet.client(ip());
      await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
      expect((await c.post('/api/me/password', { newPassword: COMPROMISED, password: u.password })).status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await quiet.close();
    }
  });
});
