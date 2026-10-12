import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, fixtureContent, FIXTURE_APPEARANCE } from '../testing/fixtures.js';
import { authTokens, media, otpCodes, rateLimits, sessions } from '../db/schema.js';
import { loadConfig } from '../config.js';
import { hashPassword, needsRehash, verifyPassword } from '../lib/crypto.js';
import { sniffImage } from '../services/media.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp({ overrides: { cronSecret: 'cron-secret-for-tests' } })));
afterAll(async () => t.close());

let ip = 1;
async function user(f = {}) {
  const u = await createUser(t.db, f);
  const c = t.client({ 'x-real-ip': `198.20.0.${ip++}` });
  await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
  return { ...u, c };
}

// PNG 1×1 valide
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const form = (bytes: Buffer, name = 'a.png', type = 'image/png') => {
  const f = new FormData();
  f.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
  return f;
};

describe('médias', () => {
  it('stocke une image, la sert avec un cache immuable et des en-têtes de sécurité, et dédoublonne', async () => {
    const { c } = await user();
    const up = await c.post('/api/me/media', form(PNG));
    expect(up.status).toBe(201);
    expect(up.body.url).toMatch(/^\/api\/media\/med_[a-f0-9]{20}$/);
    const again = await c.post('/api/me/media', form(PNG));
    expect(again.body.url).toBe(up.body.url);

    const res = await t.fetch(new Request(`http://localhost:5173${up.body.url}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await t.client().get('/api/media/med_00000000000000000000')).status).toBe(404);
    expect((await t.client().get('/api/media/..%2F..%2Fetc')).status).toBe(404);
  });

  it('refuse les fichiers qui ne sont pas des images (le type déclaré n’est pas cru), le SVG et les fichiers trop gros', async () => {
    const { c } = await user();
    expect((await c.post('/api/me/media', form(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.png', 'image/png'))).status).toBe(415);
    expect((await c.post('/api/me/media', form(Buffer.from('MZ\x90\x00' + 'x'.repeat(64)), 'virus.png', 'image/png'))).status).toBe(415);
    expect((await c.post('/api/me/media', form(Buffer.alloc(0)))).status).toBe(422);
    const big = Buffer.concat([PNG, Buffer.alloc(1_600_000)]);
    expect((await c.post('/api/me/media', form(big))).status).toBe(413);
    expect((await t.client().post('/api/me/media', form(PNG))).status).toBe(401);
    expect((await c.post('/api/me/media', { not: 'multipart' })).status).toBe(422);
  });

  it('reconnaît JPEG, PNG, WebP et GIF d’après leur contenu', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg');
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(sniffImage(Buffer.from('GIF89a\0\0\0\0\0\0\0', 'latin1'))).toBe('image/gif');
    expect(sniffImage(Buffer.from('<html>hello world, not an image</html>'))).toBeNull();
  });

  it('une image téléversée peut servir d’avatar, une image externe aussi, mais pas une adresse data:', async () => {
    const { c } = await user();
    const { url } = (await c.post('/api/me/media', form(PNG))).body;
    const blocks = fixtureContent('A').blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, avatarUrl: url } } : b));
    const doc = { username: `img${ip}`, category: 'creator', blocks, appearance: FIXTURE_APPEARANCE, share: { title: '', description: '' }, version: 0 };
    expect((await c.put('/api/me/page/draft', doc)).status).toBe(200);
    expect((await t.db.select().from(media)).length).toBeGreaterThan(0);
  });
});

describe('abonnement (aucun paiement n’est traité)', () => {
  it('renvoie l’offre gratuite par défaut, refuse de simuler un paiement et gère l’annulation d’une offre payante', async () => {
    const free = await user();
    expect((await free.c.get('/api/me/subscription')).body).toMatchObject({ planId: 'free', status: 'active', cancelAtPeriodEnd: false });
    expect((await free.c.get('/api/me/invoices')).body).toEqual([]);
    expect((await free.c.post('/api/me/subscription/change', { planId: 'pro', period: 'monthly' })).body).toEqual({ status: 'unavailable', reason: 'payments_not_connected' });
    expect((await free.c.post('/api/me/subscription/cancel')).status).toBe(409);
    expect((await free.c.post('/api/me/subscription/change', { planId: 'gold', period: 'monthly' })).status).toBe(422);

    const pro = await user({ plan: 'pro' });
    expect((await pro.c.post('/api/me/subscription/cancel')).body.cancelAtPeriodEnd).toBe(true);
    expect((await pro.c.post('/api/me/subscription/resume')).body.cancelAtPeriodEnd).toBe(false);
    expect((await pro.c.get('/api/auth/session')).body.entitlements).toMatchObject({ maxBlocks: 50, removeBranding: true, analyticsDays: 90 });
  });
});

describe('reprise de l’assistant de configuration', () => {
  it('enregistre le brouillon côté serveur (reprise sur un autre appareil)', async () => {
    const { c, email, password } = await user();
    expect((await c.get('/api/me/onboarding')).body).toEqual({ state: null });
    expect((await c.put('/api/me/onboarding', { state: { step: 3, category: 'creator' } })).status).toBe(204);
    const other = t.client({ 'x-real-ip': `198.20.1.${ip++}` });
    await other.post('/api/auth/sign-in', { email, password });
    expect((await other.get('/api/me/onboarding')).body).toEqual({ state: { step: 3, category: 'creator' } });
    expect((await c.put('/api/me/onboarding', { state: 'x'.repeat(10) })).status).toBe(422);
    expect((await c.put('/api/me/onboarding', { state: { big: 'x'.repeat(50_000) } })).status).toBe(413);
  });
});

describe('maintenance, santé et robustesse', () => {
  it('répond à la sonde de santé sans rien divulguer', async () => {
    const r = await t.client().get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
    expect(Object.keys(r.body).sort()).toEqual(['db', 'status']);
  });

  it('purge les données périmées uniquement avec le secret du cron', async () => {
    expect((await t.client().get('/api/cron/maintenance')).status).toBe(403);
    expect((await t.client().get('/api/cron/maintenance', { authorization: 'Bearer mauvais' })).status).toBe(403);
    const u = await createUser(t.db);
    await t.db.insert(sessions).values({ id: 'old-session', userId: u.user.id, expiresAt: new Date(0) });
    await t.db.insert(otpCodes).values({ id: 'otp_old', phone: '+224600000000', codeHash: 'x', channel: 'sms', expiresAt: new Date(0), createdAt: new Date(Date.now() - 3 * 86_400_000) });
    await t.db.insert(authTokens).values({ id: 'tok_old', userId: u.user.id, kind: 'email_verify', tokenHash: 'h', expiresAt: new Date(Date.now() - 30 * 86_400_000) });
    await t.db.insert(rateLimits).values({ key: 'old', count: 1, windowStart: new Date(Date.now() - 5 * 86_400_000) });
    const r = await t.client().get('/api/cron/maintenance', { authorization: 'Bearer cron-secret-for-tests' });
    expect(r.status).toBe(200);
    expect(r.body.purged).toMatchObject({ sessions: 1, otp: 1, tokens: 1, rateLimits: 1 });
    expect(await t.db.select().from(sessions).where(eq(sessions.id, 'old-session'))).toHaveLength(0);
  });

  it('renvoie 404 JSON pour une route inconnue, 400/422 pour un JSON invalide, jamais de détail interne', async () => {
    const r = await t.client().get('/api/inconnu');
    expect([r.status, r.body]).toEqual([404, { message: 'not_found' }]);
    const bad = await t.fetch(new Request('http://localhost:5173/api/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{pas du json' }));
    expect(bad.status).toBe(400);
    const huge = await t.client().post('/api/auth/sign-in', { email: 'a@b.cd', password: 'x'.repeat(600_000) });
    expect(huge.status).toBe(413);
  });

  it('couvre les en-têtes de sécurité et interdit la mise en cache des routes privées', async () => {
    const { c } = await user();
    const r = await c.get('/api/me/page');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
  });
});

describe('mots de passe et configuration', () => {
  it('hache avec scrypt, vérifie, et signale les hash à recalculer', async () => {
    const h = await hashPassword('Un-Mot-de-passe-1', 10);
    expect(await verifyPassword('Un-Mot-de-passe-1', h)).toBe(true);
    expect(await verifyPassword('Un-Mot-de-passe-2', h)).toBe(false);
    expect(await verifyPassword('x', 'format$invalide')).toBe(false);
    expect(await hashPassword('Un-Mot-de-passe-1', 10)).not.toBe(h); // sel unique
    expect(needsRehash(h, 15)).toBe(true);
    expect(needsRehash(h, 10)).toBe(false);
  });

  it('refuse de démarrer en production avec une configuration dangereuse', () => {
    const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', APP_URL: 'https://1link.gn' };
    const derived = loadConfig({ ...prod });
    expect(derived.secret.length).toBeGreaterThanOrEqual(32); // dérivé de DATABASE_URL
    expect(loadConfig({ ...prod }).secret).toBe(derived.secret); // stable d'un démarrage à l'autre
    expect(loadConfig({ ...prod, DATABASE_URL: 'postgres://autre' }).secret).not.toBe(derived.secret);
    expect(() => loadConfig({ ...prod, APP_SECRET: 'court' })).toThrow(/32 caractères/);
    expect(() => loadConfig({ ...prod, APP_SECRET: 'a'.repeat(40), MAIL_PROVIDER: 'dev' })).toThrow(/MAIL_PROVIDER=dev/);
    expect(() => loadConfig({ ...prod, APP_SECRET: 'a'.repeat(40), OTP_PROVIDER: 'dev' })).toThrow(/OTP_PROVIDER=dev/);
    expect(() => loadConfig({ ...prod, APP_SECRET: 'a'.repeat(40), ENABLE_DEV_ROUTES: '1' })).toThrow(/ENABLE_DEV_ROUTES/);
    expect(() => loadConfig({ ...prod, APP_SECRET: 'a'.repeat(40), RATE_LIMIT_SCALE: '100' })).toThrow(/RATE_LIMIT_SCALE/);
    expect(() => loadConfig({ NODE_ENV: 'production', APP_SECRET: 'a'.repeat(40) })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    const ok = loadConfig({ ...prod, APP_SECRET: 'a'.repeat(40) });
    expect(ok).toMatchObject({ hardened: true, cookieSecure: true, mail: { provider: 'none' }, otp: { provider: 'none' }, devRoutes: false, rateLimitScale: 1 });
    expect(loadConfig({ VERCEL_ENV: 'preview', DATABASE_URL: 'postgres://x', APP_SECRET: 'a'.repeat(40) }).hardened).toBe(true);
  });

  it('sans fournisseur d’envoi configuré, la demande de code et le renvoi d’e-mail échouent honnêtement (jamais de faux succès)', async () => {
    const strict = await createTestApp({ overrides: { otp: { ...t.deps.config.otp, provider: 'none' }, mail: { ...t.deps.config.mail, provider: 'none' } } });
    try {
      const noOtp = { ...strict.deps, otp: { provider: 'none' as const, send: async () => { throw new Error('x'); } } };
      expect(noOtp.otp.provider).toBe('none');
      const c = strict.client({ 'x-real-ip': '198.20.9.9' });
      const r = await c.post('/api/auth/otp/request', { phone: '+224622000099', channel: 'sms' });
      expect([r.status, r.body.message]).toEqual([503, 'otp_unavailable']);
    } finally {
      await strict.close();
    }
  });
});

describe('amorçage du premier administrateur', () => {
  it('attribue super_admin à l’adresse prévue, une fois son e-mail confirmé, et seulement si aucun super administrateur n’existe', async () => {
    const app = await createTestApp();
    try {
      app.deps.config.bootstrapAdminEmail = 'chef@exemple.test';
      const verify = async (email: string, ip: string) => {
        const c = app.client({ 'x-real-ip': ip });
        await c.post('/api/auth/sign-up', { name: 'Chef', email, password: 'MotDePasse-Solide-1', acceptTerms: true });
        await c.post('/api/auth/email/resend'); // la confirmation d'adresse est facultative : on demande le lien
        await new Promise((r) => setTimeout(r, 40));
        const token = decodeURIComponent(/token=([^\s&]+)/.exec(app.mailer.outbox.filter((m) => m.to === email).at(-1)!.text)![1]!);
        await c.post('/api/auth/email/verify', { token });
        return (await c.get('/api/auth/session')).body.user;
      };
      expect((await verify('autre@exemple.test', '198.18.5.1')).adminRole).toBeNull(); // adresse différente
      const chef = await app.client({ 'x-real-ip': '198.18.5.2' }).post('/api/auth/sign-up', { name: 'Chef', email: 'chef@exemple.test', password: 'MotDePasse-Solide-1', acceptTerms: true });
      expect(chef.body.user.adminRole).toBeNull(); // l'inscription seule ne suffit pas : il faut prouver la possession de l'adresse
      const mine = app.client({ 'x-real-ip': '198.18.5.2' });
      await mine.post('/api/auth/sign-in', { email: 'chef@exemple.test', password: 'MotDePasse-Solide-1' });
      await mine.post('/api/auth/email/resend');
      await new Promise((r) => setTimeout(r, 40));
      const token = decodeURIComponent(/token=([^\s&]+)/.exec(app.mailer.outbox.filter((m) => m.to === 'chef@exemple.test').at(-1)!.text)![1]!);
      const c = app.client({ 'x-real-ip': '198.18.5.3' });
      await c.post('/api/auth/sign-in', { email: 'chef@exemple.test', password: 'MotDePasse-Solide-1' });
      const after = await c.post('/api/auth/email/verify', { token });
      expect(after.body.user.adminRole).toBe('super_admin');
      expect(after.body.permissions).toContain('users:write');
      // un second compte portant l'adresse prévue n'obtient rien : un super administrateur existe déjà
      app.deps.config.bootstrapAdminEmail = 'troisieme@exemple.test';
      expect((await verify('troisieme@exemple.test', '198.18.5.4')).adminRole).toBeNull();
    } finally {
      await app.close();
    }
  }, 90_000);
});
