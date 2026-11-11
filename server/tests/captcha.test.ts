import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, uniqueEmail } from '../testing/fixtures.js';
import { TURNSTILE_VERIFY_URL } from '../lib/captcha.js';

/**
 * Défi anti-robot adaptatif. Turnstile est simulé (aucun appel réseau) : on vérifie ce qui compte — le défi n'apparaît qu'après des
 * signes d'abus, il est exigé AVANT de tester le mot de passe, la vérification est faite côté serveur, et sans clés rien ne change.
 */
const stubTurnstile = (reply: { success?: boolean; status?: number; fail?: boolean } = { success: true }) => {
  const fn = vi.fn(async (_url: string | URL, _init?: RequestInit) => {
    if (reply.fail) throw new Error('réseau coupé');
    return new Response(JSON.stringify({ success: reply.success ?? false }), { status: reply.status ?? 200 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};
afterEach(() => vi.unstubAllGlobals());

let on: TestApp;
let off: TestApp;
beforeAll(async () => {
  on = await createTestApp({ overrides: { captcha: { enabled: true, siteKey: '1x00000000000000000000AA', secret: 'secret-turnstile' } } });
  off = await createTestApp();
});
afterAll(async () => {
  await on.close();
  await off.close();
});

let n = 0;
const ipHeader = () => ({ 'x-real-ip': `198.18.80.${(n++ % 200) + 1}` });

describe('configuration', () => {
  it('exige les deux clés ensemble et reste désactivé sans elles', () => {
    const base = { NODE_ENV: 'test', DATABASE_URL: 'postgres://x' };
    expect(loadConfig(base).captcha.enabled).toBe(false);
    expect(loadConfig({ ...base, TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k' }).captcha).toEqual({ enabled: true, siteKey: 's', secret: 'k' });
    expect(() => loadConfig({ ...base, TURNSTILE_SITE_KEY: 's' })).toThrow(/TURNSTILE/);
    expect(() => loadConfig({ ...base, TURNSTILE_SECRET_KEY: 'k' })).toThrow(/TURNSTILE/);
  });

  it('annonce la clé publique à l’interface, jamais le secret ; rien sans configuration', async () => {
    const caps = (await on.client().get('/api/capabilities')).body;
    expect(caps.captcha).toEqual({ provider: 'turnstile', siteKey: '1x00000000000000000000AA' });
    expect(JSON.stringify(caps)).not.toContain('secret-turnstile');
    expect((await off.client().get('/api/capabilities')).body.captcha).toBeNull();
  });
});

describe('connexion par mot de passe', () => {
  it('sans clés : aucun défi, même après de nombreux échecs (les plafonds existants s’appliquent seuls)', async () => {
    const u = await createUser(off.db);
    const c = off.client(ipHeader());
    for (let i = 0; i < 5; i++) expect((await c.post('/api/auth/sign-in', { email: u.email, password: 'Mauvais-mot-de-passe' })).body.message).toBe('invalid_credentials');
    expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
  });

  it('après 3 échecs, exige un défi AVANT de tester le mot de passe (même le bon)', async () => {
    const fetchSpy = stubTurnstile({ success: true });
    const u = await createUser(on.db);
    const c = on.client(ipHeader());
    for (let i = 0; i < 3; i++) expect((await c.post('/api/auth/sign-in', { email: u.email, password: 'Mauvais-mot-de-passe' })).status).toBe(401);
    // Le bon mot de passe, sans jeton : refusé pour cause de défi — le mot de passe n'a pas été testé.
    const blocked = await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    expect([blocked.status, blocked.body.message]).toEqual([403, 'captcha_required']);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Avec un jeton valide (vérifié côté serveur auprès de Cloudflare), la connexion aboutit.
    const ok = await c.post('/api/auth/sign-in', { email: u.email, password: u.password, captchaToken: 'jeton-valide' });
    expect(ok.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(TURNSTILE_VERIFY_URL);
    const form = new URLSearchParams(String((init as RequestInit).body));
    expect([form.get('secret'), form.get('response')]).toEqual(['secret-turnstile', 'jeton-valide']);
    expect(form.get('remoteip')).toMatch(/^198\.18\.80\./);
  });

  it('refuse un jeton rejeté par Cloudflare, et le dit honnêtement quand le service est injoignable', async () => {
    const u = await createUser(on.db);
    const c = on.client(ipHeader());
    for (let i = 0; i < 3; i++) await c.post('/api/auth/sign-in', { email: u.email, password: 'Mauvais-mot-de-passe' });
    stubTurnstile({ success: false });
    expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password, captchaToken: 'rejoue' })).body.message).toBe('captcha_failed');
    stubTurnstile({ fail: true });
    const down = await c.post('/api/auth/sign-in', { email: u.email, password: u.password, captchaToken: 'x' });
    expect([down.status, down.body.message]).toEqual([503, 'captcha_unavailable']);
    stubTurnstile({ status: 500 });
    expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password, captchaToken: 'x' })).status).toBe(503);
  });

  it('un autre compte sur une autre adresse IP n’est pas inquiété', async () => {
    const a = await createUser(on.db);
    const bad = on.client(ipHeader());
    for (let i = 0; i < 4; i++) await bad.post('/api/auth/sign-in', { email: a.email, password: 'Mauvais-mot-de-passe' });
    const b = await createUser(on.db);
    expect((await on.client(ipHeader()).post('/api/auth/sign-in', { email: b.email, password: b.password })).status).toBe(200);
    expect((await on.client(ipHeader()).post('/api/auth/sign-in', { email: a.email, password: a.password })).status).toBe(200); // un tiers ne verrouille pas le compte
  });

  it('une adresse IP qui enchaîne les échecs sur des comptes différents est défiée sur un nouveau compte', async () => {
    stubTurnstile({ success: true });
    const spray = on.client(ipHeader());
    for (let i = 0; i < 10; i++) await spray.post('/api/auth/sign-in', { email: uniqueEmail('cible'), password: 'Mauvais-mot-de-passe' });
    const fresh = await createUser(on.db);
    expect((await spray.post('/api/auth/sign-in', { email: fresh.email, password: fresh.password })).body.message).toBe('captcha_required');
    expect((await spray.post('/api/auth/sign-in', { email: fresh.email, password: fresh.password, captchaToken: 'ok' })).status).toBe(200);
  });
});

describe('rafales de demandes de codes depuis une même adresse IP', () => {
  it('au-delà de 6 demandes par heure, un défi est exigé (code e-mail)', async () => {
    stubTurnstile({ success: true });
    const c = on.client(ipHeader());
    for (let i = 0; i < 6; i++) expect((await c.post('/api/auth/email-code/request', { email: uniqueEmail('rafale') })).status).toBe(200);
    const blocked = await c.post('/api/auth/email-code/request', { email: uniqueEmail('rafale') });
    expect([blocked.status, blocked.body.message]).toEqual([403, 'captcha_required']);
    expect((await c.post('/api/auth/email-code/request', { email: uniqueEmail('rafale'), captchaToken: 'ok' })).status).toBe(200);
  });

  it('un usage normal (quelques demandes) ne voit jamais de défi', async () => {
    const c = on.client(ipHeader());
    for (let i = 0; i < 3; i++) expect((await c.post('/api/auth/email-code/request', { email: uniqueEmail('normal') })).status).toBe(200);
  });

  it('s’applique aussi aux codes SMS et à la réinitialisation du mot de passe', async () => {
    stubTurnstile({ success: true });
    const sms = on.client(ipHeader());
    for (let i = 0; i < 6; i++) expect((await sms.post('/api/auth/otp/request', { phone: `+22462291${String(1000 + i)}`, channel: 'sms' })).status).toBe(200);
    expect((await sms.post('/api/auth/otp/request', { phone: '+224622919999', channel: 'sms' })).body.message).toBe('captcha_required');

    const forgot = on.client(ipHeader());
    for (let i = 0; i < 6; i++) expect((await forgot.post('/api/auth/password/forgot', { email: uniqueEmail('oubli') })).status).toBe(204);
    expect((await forgot.post('/api/auth/password/forgot', { email: uniqueEmail('oubli') })).body.message).toBe('captcha_required');
  });

  it('sans clés, aucune rafale ne déclenche de défi', async () => {
    const c = off.client(ipHeader());
    for (let i = 0; i < 8; i++) expect((await c.post('/api/auth/email-code/request', { email: uniqueEmail('libre') })).status).toBe(200);
  });
});
