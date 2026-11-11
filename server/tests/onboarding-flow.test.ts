import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signUpByCode, type TestApp } from '../testing/harness.js';
import { fixtureContent, uniqueEmail } from '../testing/fixtures.js';
import { DEFAULT_APPEARANCE } from '../../src/models/themes.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let n = 0;
const ip = () => ({ 'x-real-ip': `192.0.2.${(n++ % 200) + 1}` });
const settle = () => new Promise((r) => setTimeout(r, 60));

const page = (username: string, social: Array<{ platform: string; url: string }>, cover = '') => {
  const blocks = fixtureContent('Awa').blocks.filter((b) => b.type !== 'whatsapp').map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, coverUrl: cover } } : b));
  return {
    username, category: 'creator', version: 0, appearance: DEFAULT_APPEARANCE, share: { title: '', description: '' },
    blocks: [...blocks, { id: 'blk_soc', type: 'social', visible: true, data: { display: 'icons', items: social } }],
  };
};

describe('inscription → configuration → publication, sans confirmation d’e-mail', () => {
  it('accueille sans lien de confirmation et laisse publier tout de suite', async () => {
    const email = uniqueEmail('nouveau');
    const c = t.client(ip());
    const { r: up } = await signUpByCode(t, { client: c, email });
    expect(up.status).toBe(200);
    expect(up.body.user.emailVerified).toBe(true); // l'adresse est prouvée par le code : aucun lien de confirmation n'est envoyé ensuite
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

  it('refuse les caractères de contrôle dans les champs adresse (injection de lignes dans la fiche de contact)', async () => {
    const c = t.client(ip());
    await signUpByCode(t, { client: c, email: uniqueEmail('ctl') });
    const withVcard = (website: string) => {
      const doc = page('awa-controle', []);
      return { ...doc, blocks: [...doc.blocks, { id: 'blk_vc', type: 'vcard', visible: true, data: { label: '', fullName: 'Awa', organization: '', jobTitle: '', phone: '', email: '', website, address: '', note: '' } }] };
    };
    const hostile = 'https://exemple.com/x\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Support 1Link';
    const bad = await c.put('/api/me/page/draft', withVcard(hostile));
    expect([bad.status, bad.body.message]).toEqual([422, 'invalid']);
    expect((await c.put('/api/me/page/draft', withVcard('https://exemple.com\tx'))).status).toBe(422);
    // Une adresse propre passe (bloc « lien », disponible dans l'offre gratuite).
    const clean = page('awa-controle', [{ platform: 'discord', url: 'https://exemple.com/propre' }]);
    expect((await c.put('/api/me/page/draft', clean)).status).toBe(200);
    const dirty = page('awa-controle', [{ platform: 'discord', url: 'https://exemple.com/pro\npre' }]);
    expect((await c.put('/api/me/page/draft', { ...dirty, version: 1 })).status).toBe(422);
  });

  it('accepte les nouvelles plateformes et refuse un identifiant inconnu', async () => {
    const c = t.client(ip());
    await signUpByCode(t, { client: c, email: uniqueEmail('pl') });
    const all = ['snapchat', 'pinterest', 'github', 'spotify', 'kofi', 'audiomack', 'boomplay', 'kick', 'bluesky', 'googleplay'].map((p) => ({ platform: p, url: `https://exemple.com/${p}` }));
    expect((await c.put('/api/me/page/draft', page('awa-plateformes', all.slice(0, 10)))).status).toBe(200);
    expect((await c.put('/api/me/page/draft', { ...page('awa-plateformes', [{ platform: 'myspace', url: 'https://myspace.com/awa' }]), version: 1 })).status).toBe(422);
  });

  it('le brouillon garde la photo de couverture téléversée', async () => {
    const c = t.client(ip());
    await signUpByCode(t, { client: c, email: uniqueEmail('cv') });
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
