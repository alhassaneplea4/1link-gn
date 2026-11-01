import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from '../testing/harness.js';
import { createUser, type UserFixture } from '../testing/fixtures.js';
import { cardProducts, cards } from '../db/schema.js';
import { CARD_CODE_RE, CARD_TEMPLATES, defaultDesign } from '../../src/models/cards.js';
import { ROLE_PERMISSIONS } from '../lib/access.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let n = 20;
async function signedIn(f: UserFixture = {}) {
  const u = await createUser(t.db, f);
  const c = t.client({ 'x-real-ip': `198.51.100.${n++}` });
  expect((await c.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
  return { ...u, c };
}
const uname = () => `c${Math.random().toString(36).slice(2, 9)}`;
const customer = (username = uname()) => signedIn({ plan: 'pro', page: { username, published: true } });
const delivery = { fullName: 'Awa Diallo', phone: '+224 622 00 11 22', city: 'Conakry', address: 'Kaloum, près du marché', notes: '' };
const design = (over: Record<string, unknown> = {}) => ({ ...defaultDesign('premium_black', { name: 'Awa Diallo', title: 'Designer' }), ...over });
const order = (c: { post: Function }, productId = 'qr_basic', units = 1, d = design()) => c.post('/api/me/cards/orders', { productId, units, design: d, delivery });

describe('catalogue et prix', () => {
  it('sert les quatre produits aux tarifs configurés en base, jamais codés dans le serveur', async () => {
    const { c } = await customer();
    const cat = (await c.get('/api/me/cards/catalog')).body;
    expect(cat.products.map((p: { id: string; price: number; quantity: number }) => [p.id, p.price, p.quantity])).toEqual([['qr_basic', 40000, 1], ['nfc_premium', 75000, 1], ['qr_pack10', 350000, 10], ['nfc_pack10', 600000, 10]]);
    await t.db.update(cardProducts).set({ price: 45000 }).where(eq(cardProducts.id, 'qr_basic'));
    const o = (await order(c)).body;
    expect([o.unitPrice, o.total]).toEqual([45000, 45000]); // le prix de la base fait foi
    await t.db.update(cardProducts).set({ price: 40000 }).where(eq(cardProducts.id, 'qr_basic'));
  });
});

describe('commande', () => {
  it('crée une commande en attente de paiement avec un code public unique par carte', async () => {
    const { c, user } = await customer();
    const res = await order(c, 'nfc_pack10', 2);
    expect(res.status).toBe(201);
    const o = res.body;
    expect([o.status, o.kind, o.cardsCount, o.total, o.units]).toEqual(['awaiting_payment', 'nfc', 20, 1_200_000, 2]);
    expect(o.reference).toMatch(/^CRT-[A-Z2-9]{6}$/);
    expect(o.cards).toHaveLength(20);
    expect(new Set(o.cards.map((x: { code: string }) => x.code)).size).toBe(20);
    for (const card of o.cards) {
      expect(card.code).toMatch(CARD_CODE_RE);
      expect(card.url).toBe(`http://localhost:5173/c/${card.code}`);
      expect(card.nfc).toMatchObject({ result: 'untested', programmedUrl: '' });
    }
    expect(await t.db.select().from(cards).where(eq(cards.userId, user.id))).toHaveLength(20);
    expect((await c.get('/api/me/cards/orders')).body).toHaveLength(1);
  });

  it('refuse sans profil publié, sans connexion, un accent hors modèle, un nom vide, des images dangereuses ou trop de cartes', async () => {
    expect((await t.client().post('/api/me/cards/orders', {})).status).toBe(401);
    const draft = await signedIn({ page: { username: uname(), published: false } });
    expect((await order(draft.c)).body.message).toBe('page_not_published');
    const { c } = await customer();
    expect((await order(c, 'qr_basic', 1, design({ accent: '#123456' }))).status).toBe(422);
    expect((await order(c, 'qr_basic', 1, design({ name: '  ' }))).status).toBe(422);
    expect((await order(c, 'qr_basic', 1, design({ imageUrl: 'javascript:alert(1)' }))).status).toBe(422);
    expect((await order(c, 'qr_basic', 1, design({ imageUrl: 'http://exemple.com/a.png' }))).status).toBe(422);
    expect((await order(c, 'qr_basic', 1, design({ imageUrl: '/api/media/med_0123456789abcdef0123' }))).status).toBe(201);
    expect((await order(c, 'nfc_pack10', 21)).status).toBe(422);
    expect((await c.post('/api/me/cards/orders', { productId: 'nfc_pack10', units: 1, design: design(), delivery: { ...delivery, phone: 'abc' } })).status).toBe(422);
    expect((await order(c, 'inconnu' as never)).status).toBe(422);
    // un produit désactivé n'est plus vendu
    await t.db.update(cardProducts).set({ active: false }).where(eq(cardProducts.id, 'qr_basic'));
    expect((await order(c)).body.message).toBe('product_unavailable');
    await t.db.update(cardProducts).set({ active: true }).where(eq(cardProducts.id, 'qr_basic'));
  });

  it('n’expose jamais les commandes d’un autre client', async () => {
    const a = await customer();
    const b = await customer();
    const o = (await order(a.c)).body;
    expect((await b.c.get('/api/me/cards/orders')).body).toEqual([]);
    expect((await b.c.post(`/api/me/cards/orders/${o.id}/cancel`)).status).toBe(404);
    expect((await b.c.patch(`/api/me/cards/${o.cards[0].id}`, { active: false })).status).toBe(404);
  });

  it('le client annule tant que rien n’est payé, puis les cartes cessent de fonctionner', async () => {
    const { c } = await customer();
    const o = (await order(c)).body;
    const canceled = (await c.post(`/api/me/cards/orders/${o.id}/cancel`)).body;
    expect(canceled.status).toBe('canceled');
    expect(canceled.cards[0].status).toBe('disabled');
    expect((await t.client().get(`/api/cards/public/${o.cards[0].code}`)).body).toEqual({ state: 'disabled' });
    expect((await c.post(`/api/me/cards/orders/${o.id}/cancel`)).body.message).toBe('cannot_cancel');
  });
});

describe('QR code et NFC : une seule adresse, toujours le bon profil', () => {
  it('ouvre le profil sans compte, même après un changement de pseudonyme, et compte les scans', async () => {
    const first = uname();
    const { c } = await customer(first);
    const o = (await order(c, 'nfc_premium')).body;
    const code = o.cards[0].code;
    const visitor = t.client();
    const hit = await visitor.get(`/api/c/${code}`);
    expect(hit.status).toBe(302);
    expect(hit.headers.get('location')).toBe(`/${first}?src=card`);
    expect(hit.headers.get('cache-control')).toBe('no-store');
    // le propriétaire modifie son adresse : la carte (même code, même QR, même puce) suit
    const next = uname();
    expect((await c.patch('/api/me/page/username', { username: next })).status).toBe(200);
    expect((await visitor.get(`/api/c/${code}`)).headers.get('location')).toBe(`/${next}?src=card`);
    expect((await visitor.get(`/api/c/${code.toUpperCase()}`)).status).toBe(302);
    await new Promise((r) => setTimeout(r, 200));
    const [row] = await t.db.select().from(cards).where(eq(cards.code, code));
    expect(row!.scanCount).toBe(3);
  });

  it('un code inconnu ou mal formé ne mène nulle part et ne révèle rien', async () => {
    const v = t.client();
    for (const code of ['aaaaaaaaaa', 'x', '../../etc/passwd', 'ABCDEFGHJK']) {
      const r = await v.get(`/api/c/${encodeURIComponent(code)}`);
      expect([404, 410]).toContain(r.status);
    }
    expect((await v.get('/api/cards/public/aaaaaaaaaa')).body).toEqual({ state: 'not_found' });
  });

  it('perte ou vol : le propriétaire désactive puis réactive la carte, une désactivation de l’équipe reste à l’équipe', async () => {
    const { c } = await customer();
    const o = (await order(c)).body;
    const [card] = o.cards;
    expect((await c.patch(`/api/me/cards/${card.id}`, { active: false })).body.status).toBe('disabled');
    const gone = await t.client().get(`/api/c/${card.code}`);
    expect(gone.status).toBe(410);
    expect((await c.patch(`/api/me/cards/${card.id}`, { active: true })).body.status).toBe('active');
    expect((await t.client().get(`/api/c/${card.code}`)).status).toBe(302);

    const admin = await signedIn({ adminRole: 'admin', name: 'Admin Cartes' });
    expect((await admin.c.patch(`/api/admin/cards/${card.id}`, { active: false })).status).toBe(200);
    expect((await c.patch(`/api/me/cards/${card.id}`, { active: true })).body.message).toBe('disabled_by_admin');
  });

  it('un profil repassé en brouillon rend la carte indisponible', async () => {
    const { c } = await customer();
    const o = (await order(c)).body;
    expect((await c.post('/api/me/page/unpublish')).status).toBe(200);
    expect((await t.client().get(`/api/cards/public/${o.cards[0].code}`)).body).toEqual({ state: 'unavailable' });
  });
});

describe('administration : paiement, visuel, production, NFC, livraison', () => {
  it('suit le parcours complet, sans jamais sauter le paiement, la validation du visuel ni le test NFC', async () => {
    const { c } = await customer();
    const admin = await signedIn({ adminRole: 'admin', name: 'Admin Cartes' });
    const a = admin.c;
    const o = (await order(c, 'nfc_premium')).body;
    const base = `/api/admin/cards/orders/${o.id}`;
    const step = (status: string, extra: object = {}) => a.post(`${base}/status`, { status, ...extra });

    // le client n'a aucun accès à l'administration
    expect((await c.get('/api/admin/cards/orders')).status).toBe(403);
    expect((await a.get('/api/admin/cards/orders')).body.items.find((r: { id: string }) => r.id === o.id)).toMatchObject({ status: 'awaiting_payment', total: 75000 });

    // « Payée » n'existe que par l'enregistrement d'un paiement reçu
    expect((await step('paid')).status).toBe(422);
    expect((await step('in_production')).body.message).toBe('invalid_transition');
    expect((await a.post(`${base}/payment`, { method: 'mobile_money', reference: '' })).status).toBe(422);
    const paid = (await a.post(`${base}/payment`, { method: 'mobile_money', reference: 'OM-123456' })).body;
    expect([paid.status, paid.payment.reference]).toEqual(['paid', 'OM-123456']);
    expect((await a.post(`${base}/payment`, { method: 'bank', reference: 'X' })).body.message).toBe('not_awaiting_payment');

    // production refusée : visuel non validé, puis imprimeur non désigné
    expect((await step('validating')).body.status).toBe('validating');
    expect((await step('in_production')).body.message).toBe('design_not_approved');
    expect((await a.post(`${base}/design-review`, { approved: false, note: '' })).status).toBe(422);
    expect((await a.post(`${base}/design-review`, { approved: true })).body.designApprovedAt).toBeTruthy();
    expect((await step('in_production')).body.message).toBe('partner_required');
    expect((await a.put(`${base}/production`, { printPartner: 'Imprimerie Kaloum', partnerRef: 'IK-88' })).body.printPartner).toBe('Imprimerie Kaloum');
    expect((await step('in_production')).body.status).toBe('in_production');

    // NFC : l'adresse programmée doit être exactement celle de la carte
    const card = (await a.get(base)).body.cards[0];
    const url = card.url;
    expect((await a.put(`/api/admin/cards/${card.id}/nfc`, { chipId: 'AB:CD', programmedUrl: 'https://autre.exemple/x', result: 'passed' })).body.message).toBe('nfc_url_mismatch');
    expect((await a.put(`/api/admin/cards/${card.id}/nfc`, { chipId: '', programmedUrl: url, result: 'passed' })).status).toBe(422);
    expect((await step('quality_check')).body.status).toBe('quality_check');
    expect((await step('shipped')).body.message).toBe('nfc_not_tested');
    const nfc = (await a.put(`/api/admin/cards/${card.id}/nfc`, { chipId: '04:A2:33:1B', programmedUrl: url, result: 'passed' })).body;
    expect(nfc.cards[0].nfc).toMatchObject({ chipId: '04:A2:33:1B', programmedUrl: url, result: 'passed' });
    const shipped = (await step('shipped', { carrier: 'Transporteur local', trackingRef: 'TR-42' })).body;
    expect([shipped.status, shipped.shipping.trackingRef]).toEqual(['shipped', 'TR-42']);
    expect((await step('delivered')).body.status).toBe('delivered');
    expect((await step('canceled')).body.message).toBe('invalid_transition');

    // ce que le client voit
    const mine = (await c.get('/api/me/cards/orders')).body[0];
    expect([mine.status, mine.printPartner, mine.history.length > 6]).toEqual(['delivered', 'Imprimerie Kaloum', true]);
  });

  it('une carte QR n’a pas de puce NFC à enregistrer, et un paiement n’est jamais déduit d’un statut', async () => {
    const { c } = await customer();
    const admin = await signedIn({ adminRole: 'super_admin', name: 'Super' });
    const o = (await order(c, 'qr_basic')).body;
    expect((await admin.c.put(`/api/admin/cards/${o.cards[0].id}/nfc`, { chipId: 'x', programmedUrl: '', result: 'failed' })).body.message).toBe('not_nfc');
    expect((await admin.c.post(`/api/admin/cards/orders/${o.id}/status`, { status: 'validating' })).body.message).toBe('invalid_transition');
  });

  it('l’annulation par l’équipe désactive les cartes ; les droits sont contrôlés par le serveur', async () => {
    const { c } = await customer();
    const o = (await order(c)).body;
    const support = await signedIn({ adminRole: 'support' });
    const finance = await signedIn({ adminRole: 'finance' });
    const analyst = await signedIn({ adminRole: 'analyst' });
    expect((await analyst.c.get('/api/admin/cards/orders')).status).toBe(403);
    expect((await support.c.get('/api/admin/cards/orders')).status).toBe(200);
    expect((await support.c.post(`/api/admin/cards/orders/${o.id}/payment`, { method: 'cash', reference: 'x' })).status).toBe(403);
    expect((await finance.c.post(`/api/admin/cards/orders/${o.id}/payment`, { method: 'cash', reference: 'Reçu 12' })).status).toBe(200);
    expect((await finance.c.post(`/api/admin/cards/orders/${o.id}/status`, { status: 'canceled', note: 'Remboursé' })).body.cards[0].status).toBe('disabled');
    expect((await t.client().get(`/api/cards/public/${o.cards[0].code}`)).body).toEqual({ state: 'disabled' });
    expect(ROLE_PERMISSIONS.analyst).not.toContain('cards:read');
  });

  it('les tarifs et la consigne de paiement se modifient depuis l’administration', async () => {
    const { c } = await customer();
    const admin = await signedIn({ adminRole: 'admin' });
    expect((await c.patch('/api/admin/cards/products/qr_basic', { price: 1 })).status).toBe(403);
    expect((await admin.c.patch('/api/admin/cards/products/qr_basic', { price: -5 })).status).toBe(422);
    expect((await admin.c.patch('/api/admin/cards/products/qr_basic', { price: 42000 })).body.products[0].price).toBe(42000);
    expect((await admin.c.put('/api/admin/cards/settings', { paymentInstructions: 'Orange Money 622 00 00 00 — indiquez la référence.' })).status).toBe(200);
    const cat = (await c.get('/api/me/cards/catalog')).body;
    expect([cat.products[0].price, cat.paymentInstructions]).toEqual([42000, 'Orange Money 622 00 00 00 — indiquez la référence.']);
    await admin.c.patch('/api/admin/cards/products/qr_basic', { price: 40000 });
    await admin.c.put('/api/admin/cards/settings', { paymentInstructions: '' });
  });
});

describe('modèles', () => {
  it('chaque modèle a au moins une couleur d’accent et un design par défaut valide', () => {
    for (const tpl of Object.values(CARD_TEMPLATES)) {
      expect(tpl.accents.length).toBeGreaterThan(0);
      expect(defaultDesign(tpl.id).accent).toBe(tpl.accents[0]);
    }
  });
});
