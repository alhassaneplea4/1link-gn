/** 1Link Cards : routes publiques (QR code / NFC), espace client (`/me/cards`) et administration (`/admin/cards`). */
import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../context.js';
import { notFound } from '../lib/errors.js';
import { parseListQuery } from '../lib/lists.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { readJson } from '../lib/request.js';
import { requireAnyPermission, requireAuth } from '../middleware.js';
import * as cards from '../services/cards.js';
import { loadTemplate, metaBlock, withHead } from './seo.js';
import { designSchema, nfcSchema, orderSchema, paymentSchema, productPatchSchema, productionSchema, reviewSchema, settingsSchema, statusSchema } from '../validation/cards.js';
import type { Permission } from '../../src/models/auth.js';

// — Public : ce que le QR code et la puce NFC ouvrent —

export const cardPublicRoutes = new Hono<HonoEnv>();

/**
 * `<domaine>/c/<code>` : redirection vers le profil public de la carte. Jamais mise en cache (désactiver une carte perdue prend
 * effet immédiatement). Le visiteur n'a besoin ni de compte ni d'application ; la vue est comptée dans les statistiques sous le canal « card ».
 */
cardPublicRoutes.get('/c/:code', async (c) => {
  const deps = c.get('deps');
  await enforce(deps.db, keyFor('card-scan', c.get('ip')), 240, 60, deps.now());
  const code = c.req.param('code');
  const res = await cards.resolveCard(deps, code, true);
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  if (res.state === 'active') return c.redirect(`/${res.username}?src=card`, 302);
  // Carte désactivée, inconnue ou profil hors ligne : on sert l'application elle-même (un redirect bouclerait sur la même réécriture),
  // qui lit l'état public de la carte et affiche un message clair. Jamais indexé, aucune donnée personnelle.
  const base = deps.config.publicUrl;
  const html = withHead(await loadTemplate(), '1Link', metaBlock({ url: `${base}/c/${code.toLowerCase().slice(0, 20)}`, title: '1Link', description: '1Link', image: `${base}/og-default.png`, type: 'website', noindex: true }));
  return c.html(html, res.state === 'disabled' ? 410 : 404);
});

/** État public d'une carte (sans aucune donnée personnelle) pour la page d'information de l'application. */
cardPublicRoutes.get('/cards/public/:code', async (c) => {
  const deps = c.get('deps');
  await enforce(deps.db, keyFor('card-scan', c.get('ip')), 240, 60, deps.now());
  c.header('Cache-Control', 'no-store');
  return c.json(await cards.resolveCard(deps, c.req.param('code'), false));
});

// — Espace client —

export const myCardRoutes = new Hono<HonoEnv>();
myCardRoutes.use('*', requireAuth);

myCardRoutes.get('/cards/catalog', async (c) => c.json(await cards.getCatalog(c.get('deps'))));
myCardRoutes.get('/cards/orders', async (c) => c.json(await cards.listMyOrders(c.get('deps'), c.get('auth')!.user.id)));
myCardRoutes.post('/cards/orders', async (c) => c.json(await cards.createOrder(c, c.get('deps'), c.get('auth')!, await readJson(c, orderSchema, 20_000)), 201));
myCardRoutes.post('/cards/orders/:id/cancel', async (c) => c.json(await cards.cancelMyOrder(c, c.get('deps'), c.get('auth')!, c.req.param('id'))));
myCardRoutes.put('/cards/orders/:id/design', async (c) => c.json(await cards.updateMyDesign(c.get('deps'), c.get('auth')!, c.req.param('id'), await readJson(c, designSchema, 8_000))));
myCardRoutes.patch('/cards/:id', async (c) => {
  const body = await readJson(c, z.object({ active: z.boolean() }), 1_000);
  return c.json(await cards.setMyCardActive(c, c.get('deps'), c.get('auth')!, c.req.param('id'), body.active));
});

// — Administration —

export const adminCardRoutes = new Hono<HonoEnv>();
adminCardRoutes.use('*', requireAuth);
const can = (...p: Permission[]) => requireAnyPermission(...p);

adminCardRoutes.get('/cards/orders', can('cards:read'), async (c) => c.json(await cards.adminListOrders(c.get('deps'), parseListQuery(c))));
adminCardRoutes.get('/cards/orders/:id', can('cards:read'), async (c) => c.json(await cards.adminGetOrder(c.get('deps'), c.req.param('id'))));
adminCardRoutes.post('/cards/orders/:id/payment', can('cards:write'), async (c) => c.json(await cards.recordPayment(c, c.get('deps'), c.get('auth')!, c.req.param('id'), await readJson(c, paymentSchema, 2_000))));
adminCardRoutes.post('/cards/orders/:id/design-review', can('cards:write'), async (c) => c.json(await cards.reviewDesign(c, c.get('deps'), c.get('auth')!, c.req.param('id'), await readJson(c, reviewSchema, 2_000))));
adminCardRoutes.put('/cards/orders/:id/production', can('cards:write'), async (c) => c.json(await cards.setProduction(c, c.get('deps'), c.get('auth')!, c.req.param('id'), await readJson(c, productionSchema, 2_000))));
adminCardRoutes.post('/cards/orders/:id/status', can('cards:write'), async (c) => c.json(await cards.changeStatus(c, c.get('deps'), c.get('auth')!, c.req.param('id'), await readJson(c, statusSchema, 2_000))));
adminCardRoutes.put('/cards/:id/nfc', can('cards:write'), async (c) => c.json(await cards.recordNfc(c, c.get('deps'), c.get('auth')!, c.req.param('id'), await readJson(c, nfcSchema, 2_000))));
adminCardRoutes.patch('/cards/:id', can('cards:write'), async (c) => {
  const body = await readJson(c, z.object({ active: z.boolean() }), 1_000);
  return c.json(await cards.adminSetCardActive(c, c.get('deps'), c.get('auth')!, c.req.param('id'), body.active));
});
adminCardRoutes.get('/cards/products', can('cards:read'), async (c) => c.json(await cards.adminProducts(c.get('deps'))));
adminCardRoutes.patch('/cards/products/:id', can('cards:write'), async (c) => c.json(await cards.updateProduct(c, c.get('deps'), c.get('auth')!, c.req.param('id'), await readJson(c, productPatchSchema, 1_000))));
adminCardRoutes.put('/cards/settings', can('cards:write'), async (c) => c.json(await cards.setPaymentInstructions(c, c.get('deps'), c.get('auth')!, (await readJson(c, settingsSchema, 4_000)).paymentInstructions)));
adminCardRoutes.all('/cards/*', () => {
  throw notFound();
});
