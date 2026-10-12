import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { fixtureContent, FIXTURE_APPEARANCE, uniqueEmail } from '../testing/fixtures.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let n = 0;
const ip = () => ({ 'x-real-ip': `192.0.2.${(n++ % 200) + 1}` });
const settle = () => new Promise((r) => setTimeout(r, 60));

const page = (username: string, social: Array<{ platform: string; url: string }>, cover = '') => {
  const blocks = fixtureContent('Awa').blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, coverUrl: cover } } : b));
  return {
    username, category: 'creator', version: 0, appearance: FIXTURE_APPEARANCE, share: { title: '', description: '' },
    blocks: [...blocks, { id: 'blk_soc', type: 'social', visible: true, data: { display: 'icons', items: social } }],
  };
};

describe('inscription → configuration → publication, sans confirmation d’e-mail', () => {
  it('accueille sans lien de confirmation et laisse publier tout de suite', async () => {
    const email = uniqueEmail('nouveau');
    const c = t.client(ip());
    const up = await c.post('/api/auth/sign-up', { name: 'Awa Nouvelle', email, password: 'MotDePasse-2026', acceptTerms: true });
    expect(up.status).toBe(200);
    expect(up.body.user.emailVerified).toBe(false);
    await settle();
    const mail = t.mailer.outbox.filter((m) => m.to === email).at(-1)!;
    expect(mail.subject).toBe('Bienvenue sur 1Link');
    expect(mail.text).not.toMatch(/token=/);
    expect(mail.text).toContain('/onboarding');

    const draft = await c.put('/api/me/page/draft', page('awa-neuve', [{ platform: 'discord', url: 'https://discord.gg/awa' }]));
    expect(draft.status).toBe(200);
    const pub = await c.post('/api/me/page/publish', { ...page('awa-neuve', [{ platform: 'discord', url: 'https://discord.gg/awa' }, { platform: 'twitch', url: 'https://twitch.tv/awa' }]), version: draft.body.version });
    expect(pub.status).toBe(200);
    const live = (await t.client(ip()).get('/api/pages/awa-neuve')).body;
    expect(live.state).toBe('published');
    const soc = live.page.blocks.find((b: { type: string }) => b.type === 'social').data.items.map((i: { platform: string }) => i.platform);
    expect(soc).toEqual(['discord', 'twitch']);
  });

  it('accepte les nouvelles plateformes et refuse un identifiant inconnu', async () => {
    const c = t.client(ip());
    await c.post('/api/auth/sign-up', { name: 'Awa Plateformes', email: uniqueEmail('pl'), password: 'MotDePasse-2026', acceptTerms: true });
    const all = ['snapchat', 'pinterest', 'github', 'spotify', 'kofi', 'audiomack', 'boomplay', 'kick', 'bluesky', 'googleplay'].map((p) => ({ platform: p, url: `https://exemple.com/${p}` }));
    expect((await c.put('/api/me/page/draft', page('awa-plateformes', all.slice(0, 10)))).status).toBe(200);
    expect((await c.put('/api/me/page/draft', { ...page('awa-plateformes', [{ platform: 'myspace', url: 'https://myspace.com/awa' }]), version: 1 })).status).toBe(422);
  });

  it('le brouillon garde la photo de couverture téléversée', async () => {
    const c = t.client(ip());
    await c.post('/api/auth/sign-up', { name: 'Awa Couverture', email: uniqueEmail('cv'), password: 'MotDePasse-2026', acceptTerms: true });
    const form = new FormData();
    form.append('file', new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)])], 'cover.png', { type: 'image/png' }));
    const up = await c.send('POST', '/api/me/media', form);
    expect([200, 201]).toContain(up.status);
    const url = (up.body as { url: string }).url;
    const saved = await c.put('/api/me/page/draft', page('awa-couv', [], url));
    expect(saved.status).toBe(200);
    expect(saved.body.blocks.find((b: { type: string }) => b.type === 'profile').data.coverUrl).toBe(url);
    // La retirer fonctionne aussi.
    const cleared = await c.put('/api/me/page/draft', { ...page('awa-couv', [], ''), version: saved.body.version });
    expect(cleared.body.blocks.find((b: { type: string }) => b.type === 'profile').data.coverUrl).toBe('');
  });
});
