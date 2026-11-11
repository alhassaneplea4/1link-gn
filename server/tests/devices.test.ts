import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestApp, type TestApp, type TestClient } from '../testing/harness.js';
import { createUser } from '../testing/fixtures.js';
import { sessions, securityEvents, userDevices } from '../db/schema.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let n = 0;
const browser = (ua: string, country = 'GN') => t.client({ 'x-real-ip': `41.77.12.${(n++ % 250) + 1}`, 'user-agent': ua, 'x-vercel-ip-country': country });
const settle = () => new Promise((r) => setTimeout(r, 50));
const alertsTo = (email: string) => t.mailer.outbox.filter((m) => m.to === email && /Nouvelle connexion à votre compte/.test(m.subject));
const signIn = (c: TestClient, u: { email: string | null; password: string }) => c.post('/api/auth/sign-in', { email: u.email, password: u.password });

describe('appareils connus et alerte de nouvel appareil', () => {
  it('ne prévient pas pour le tout premier appareil, ni pour un appareil déjà reconnu', async () => {
    const u = await createUser(t.db);
    const home = browser(CHROME_WINDOWS);
    expect((await signIn(home, u)).status).toBe(200);
    expect(home.cookie).toContain('onelink_device=');
    await settle();
    expect(alertsTo(u.email!)).toHaveLength(0);

    await home.post('/api/auth/sign-out');
    expect((await signIn(home, u)).status).toBe(200); // même navigateur : reconnu
    await settle();
    expect(alertsTo(u.email!)).toHaveLength(0);
    expect(await t.db.select().from(userDevices).where(eq(userDevices.userId, u.user.id))).toHaveLength(1);
  });

  it('prévient par e-mail quand une session s’ouvre depuis un appareil inconnu, en disant d’où elle vient', async () => {
    const u = await createUser(t.db);
    expect((await signIn(browser(CHROME_WINDOWS), u)).status).toBe(200);
    expect((await signIn(browser(SAFARI_IPHONE, 'SN'), u)).status).toBe(200); // autre navigateur : aucun cookie d'appareil
    await settle();
    const [mail] = alertsTo(u.email!);
    expect(mail).toBeDefined();
    expect(mail!.text).toContain('Safari sur iOS, Sénégal');
    expect(mail!.text).toContain('/dashboard/security');
    expect(mail!.text).not.toContain('Mozilla'); // jamais le User-Agent brut
    const events = await t.db.select().from(securityEvents).where(and(eq(securityEvents.userId, u.user.id), eq(securityEvents.kind, 'new_device')));
    expect(events.some((e) => /nouvel appareil/.test(e.subject))).toBe(true);
    expect(await t.db.select().from(userDevices).where(eq(userDevices.userId, u.user.id))).toHaveLength(2);
  });

  it('ne stocke que l’empreinte du cookie d’appareil, pas sa valeur', async () => {
    const u = await createUser(t.db);
    const c = browser(CHROME_WINDOWS);
    await signIn(c, u);
    const value = /onelink_device=([^;\s]+)/.exec(c.cookie)![1]!;
    const rows = await t.db.select().from(userDevices).where(eq(userDevices.userId, u.user.id));
    expect(rows.some((r) => r.deviceHash === value)).toBe(false);
    expect(rows[0]!.label).toBe('Chrome · Windows');
  });

  it('un compte sans e-mail (téléphone seul) se connecte normalement depuis un nouvel appareil', async () => {
    const phone = '+224622900123';
    await createUser(t.db, { email: null, phone, phoneVerified: true });
    for (const ua of [CHROME_WINDOWS, SAFARI_IPHONE]) {
      const c = browser(ua);
      expect((await c.post('/api/auth/otp/request', { phone, channel: 'sms' })).status).toBe(200);
      t.clock.advance(31_000);
      const r = await c.post('/api/auth/otp/verify', { phone, code: t.otp.sent.at(-1)!.code, mode: 'sign_in' });
      expect(r.status).toBe(200);
    }
  });

  it('garde au plus 20 appareils par compte', async () => {
    const u = await createUser(t.db);
    for (let i = 0; i < 23; i++) await signIn(browser(CHROME_WINDOWS), u);
    expect(await t.db.select().from(userDevices).where(eq(userDevices.userId, u.user.id))).toHaveLength(20);
  });
});

describe('page « appareils connectés » : voir et fermer ses sessions', () => {
  it('liste les sessions ouvertes (adresse IP masquée, navigateur, système, pays) et repère la courante', async () => {
    const u = await createUser(t.db);
    const a = browser(CHROME_WINDOWS);
    const b = browser(SAFARI_IPHONE, 'SN');
    await signIn(a, u);
    await signIn(b, u);
    const list = (await a.get('/api/me/sessions')).body as Array<Record<string, unknown>>;
    expect(list).toHaveLength(2);
    expect(list.filter((s) => s.current)).toHaveLength(1);
    const mine = list.find((s) => s.current)!;
    expect(mine).toMatchObject({ browser: 'Chrome', os: 'Windows', country: 'GN', factor: 'single' });
    expect(String(mine.ip)).toMatch(/^41\.77\.12\.•$/);
    expect(String(mine.id)).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(list)).not.toMatch(/Mozilla/);
    expect((await t.client().get('/api/me/sessions')).status).toBe(401);
  });

  it('ferme une session précise : l’autre navigateur est aussitôt déconnecté', async () => {
    const u = await createUser(t.db);
    const a = browser(CHROME_WINDOWS);
    const b = browser(SAFARI_IPHONE);
    await signIn(a, u);
    await signIn(b, u);
    const other = ((await a.get('/api/me/sessions')).body as Array<{ id: string; current: boolean }>).find((s) => !s.current)!;
    expect((await a.send('DELETE', `/api/me/sessions/${other.id}`)).status).toBe(204);
    expect((await b.get('/api/auth/session')).body).toBeNull();
    expect((await a.get('/api/auth/session')).body.user.email).toBe(u.email);
    expect((await a.send('DELETE', `/api/me/sessions/${other.id}`)).status).toBe(404); // déjà fermée
    expect((await a.send('DELETE', '/api/me/sessions/pas-un-identifiant')).status).toBe(404);
  });

  it('fermer la session courante revient à se déconnecter', async () => {
    const u = await createUser(t.db);
    const a = browser(CHROME_WINDOWS);
    await signIn(a, u);
    const current = ((await a.get('/api/me/sessions')).body as Array<{ id: string; current: boolean }>).find((s) => s.current)!;
    expect((await a.send('DELETE', `/api/me/sessions/${current.id}`)).status).toBe(204);
    expect((await a.get('/api/auth/session')).body).toBeNull();
  });

  it('ne permet jamais d’agir sur la session d’un autre compte', async () => {
    const victim = await createUser(t.db);
    const attacker = await createUser(t.db);
    const v = browser(CHROME_WINDOWS);
    const a = browser(SAFARI_IPHONE);
    await signIn(v, victim);
    await signIn(a, attacker);
    const victimHandle = ((await v.get('/api/me/sessions')).body as Array<{ id: string }>)[0]!.id;
    expect((await a.send('DELETE', `/api/me/sessions/${victimHandle}`)).status).toBe(404);
    expect((await v.get('/api/auth/session')).body.user.email).toBe(victim.email);
    expect(await t.db.select().from(sessions).where(eq(sessions.userId, victim.user.id))).toHaveLength(1);
  });

  it('ferme toutes les autres sessions en gardant la courante', async () => {
    const u = await createUser(t.db);
    const clients = [browser(CHROME_WINDOWS), browser(SAFARI_IPHONE), browser(CHROME_WINDOWS)];
    for (const c of clients) await signIn(c, u);
    expect((await clients[0]!.post('/api/me/sessions/revoke-others')).status).toBe(204);
    expect((await clients[0]!.get('/api/auth/session')).body.user.email).toBe(u.email);
    expect((await clients[1]!.get('/api/auth/session')).body).toBeNull();
    expect((await clients[2]!.get('/api/auth/session')).body).toBeNull();
  });
});
