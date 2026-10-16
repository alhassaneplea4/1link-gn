import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, type UserFixture } from '../testing/fixtures.js';
import { DEFAULT_APPEARANCE } from '../../src/models/themes.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let n = 90;
async function signedIn(f: UserFixture = {}) {
  const u = await createUser(t.db, f);
  const c = t.client({ 'x-real-ip': `203.0.113.${n++}` });
  expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
  return { ...u, c };
}
const uname = () => `l${Math.random().toString(36).slice(2, 9)}`;
const profile = (extra: Record<string, unknown> = {}) => ({ id: 'blk_profile', type: 'profile', visible: true, data: { displayName: 'Awa', headline: 'Chef', bio: '', avatarUrl: '', coverUrl: '', location: '', sector: 'Restauration', verified: false, ...extra } });
const doc = (username: string, blocks: unknown[] = [profile()], version = 0) =>
  ({ username, category: 'creator', blocks, appearance: DEFAULT_APPEARANCE, share: { title: '', description: '' }, version });

describe('adresse 1Link (lien de la page)', () => {
  it('change le lien : l’ancien cesse de fonctionner, le nouveau sert la page', async () => {
    const { c } = await signedIn();
    const first = uname();
    const pub = await c.post('/api/me/page/publish', doc(first));
    expect(pub.status).toBe(200);
    expect(pub.body.blocks[0].data.sector).toBe('Restauration');

    const next = uname();
    const r = await c.patch('/api/me/page/username', { username: next });
    expect([r.status, r.body.username, r.body.status]).toEqual([200, next, 'published']);
    expect((await t.client().get(`/api/pages/${first}`)).body).toEqual({ state: 'not_found' });
    expect((await t.client().get(`/api/pages/${next}`)).body.state).toBe('published');
  });

  it('refuse une adresse prise, réservée ou invalide, et exige une page', async () => {
    const a = await signedIn();
    const b = await signedIn();
    const taken = uname();
    await b.c.post('/api/me/page/publish', doc(taken));
    await a.c.post('/api/me/page/publish', doc(uname()));
    expect((await a.c.patch('/api/me/page/username', { username: taken })).body.message).toBe('username_taken');
    expect((await a.c.patch('/api/me/page/username', { username: 'admin' })).body.message).toBe('username_reserved');
    expect((await a.c.patch('/api/me/page/username', { username: 'A!' })).body.message).toBe('username_invalid');
    const none = await signedIn();
    expect((await none.c.patch('/api/me/page/username', { username: uname() })).status).toBe(404);
    expect((await t.client().patch('/api/me/page/username', { username: uname() })).status).toBe(401);
  });

  it('limite à 5 changements par jour', async () => {
    const { c } = await signedIn();
    await c.post('/api/me/page/publish', doc(uname()));
    for (let i = 0; i < 5; i++) expect((await c.patch('/api/me/page/username', { username: uname() })).status).toBe(200);
    expect((await c.patch('/api/me/page/username', { username: uname() })).status).toBe(429);
  });

  it('un compte dont l’essai est terminé ne peut plus changer son lien', async () => {
    const { c, user } = await signedIn({ page: { username: uname(), published: true } });
    await t.db.execute((await import('drizzle-orm')).sql`update users set free_trial_ends_at = now() - interval '2 days' where id = ${user.id}`);
    t.clock.advance(60_000);
    const r = await c.patch('/api/me/page/username', { username: uname() });
    expect([r.status, r.body.message]).toEqual([403, 'subscription_required']);
  });
});

describe('galerie : cinq images au plus', () => {
  const gallery = (count: number) => ({ id: 'blk_gal', type: 'gallery', visible: true, data: { title: 'Photos', images: Array.from({ length: count }, (_, i) => ({ url: `https://exemple.com/${i}.jpg`, alt: `Photo ${i}` })) } });

  it('accepte 5 images à la publication et refuse la sixième', async () => {
    const { c } = await signedIn({ plan: 'pro' });
    const username = uname();
    const ok = await c.post('/api/me/page/publish', doc(username, [profile(), gallery(5)]));
    expect(ok.status).toBe(200);
    const six = await c.post('/api/me/page/publish', doc(username, [profile(), gallery(6)], ok.body.version));
    expect(six.status).toBe(422);
  });

  it('la galerie est réservée aux offres Pro et Business', async () => {
    const { c } = await signedIn({ plan: 'basic' });
    const r = await c.put('/api/me/page/draft', doc(uname(), [profile(), gallery(2)]));
    expect([r.status, r.body.fields.feature]).toEqual([403, 'block:gallery']);
  });
});
