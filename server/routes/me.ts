import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { C, Deps, HonoEnv } from '../context.js';
import { payments, subscriptions, users } from '../db/schema.js';
import { conflict, forbidden, HttpError, badRequest } from '../lib/errors.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { readJson } from '../lib/request.js';
import { requireAuth } from '../middleware.js';
import { MAX_DOC_BYTES, pageInput } from '../validation/page.js';
import { getOwnerPage, ownerDocument, unpublish, writePage } from '../services/pages.js';
import { getVerificationState, requestVerification, verificationInput } from '../services/verification.js';
import { userReport } from '../services/analytics.js';
import { storeImage, MAX_IMAGE_BYTES } from '../services/media.js';
import { isContactVerified } from '../../src/models/auth.js';
import type { ChangePlanResult, Invoice, Subscription } from '../../src/models/billing.js';
import type { RangePreset } from '../../src/models/analytics.js';
import type { PlanId } from '../../src/models/auth.js';

export const meRoutes = new Hono<HonoEnv>();
meRoutes.use('*', requireAuth);

// — Page —

meRoutes.get('/page', async (c) => {
  const { user } = c.get('auth')!;
  const row = await getOwnerPage(c.get('deps'), user.id);
  return c.json(row ? ownerDocument(row, user.verified) : null);
});

meRoutes.put('/page/draft', async (c) => {
  const deps = c.get('deps');
  const input = await readJson(c, pageInput('draft'), MAX_DOC_BYTES + 50_000);
  return c.json(await writePage(deps, c.get('auth')!, input, { publish: false }));
});

meRoutes.post('/page/publish', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  if (!isContactVerified({ emailVerified: auth.user.emailVerifiedAt !== null, phoneVerified: auth.user.phoneVerifiedAt !== null })) throw forbidden('email_not_verified');
  const input = await readJson(c, pageInput('publish'), MAX_DOC_BYTES + 50_000);
  const profile = input.blocks.find((b) => b.type === 'profile');
  if (!profile || profile.type !== 'profile' || !profile.data.displayName.trim()) throw badRequest('incomplete', { displayName: 'required' });
  await enforce(deps.db, keyFor('publish', auth.user.id), 60, 3600, deps.now());
  return c.json(await writePage(deps, auth, input, { publish: true }));
});

meRoutes.post('/page/unpublish', async (c) => c.json(await unpublish(c.get('deps'), c.get('auth')!)));

// — Vérification du profil —

meRoutes.get('/verification', async (c) => c.json(await getVerificationState(c.get('deps'), c.get('auth')!)));
meRoutes.post('/verification', async (c) => {
  const input = await readJson(c, verificationInput);
  return c.json(await requestVerification(c.get('deps'), c.get('auth')!, input));
});

// — Statistiques —

const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preset: z.enum(['today', '7d', '30d', '90d', 'custom']).default('custom'),
});

meRoutes.get('/analytics', async (c) => {
  const parsed = rangeQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) throw badRequest('invalid_range');
  return c.json(await userReport(c.get('deps'), c.get('auth')!, { ...parsed.data, preset: parsed.data.preset as RangePreset }, c.req.header('accept-language') ?? 'fr'));
});

// — Abonnement (aucun paiement n'est traité par la plateforme) —

const subscriptionOf = async (deps: Deps, userId: string): Promise<Subscription> => {
  const [s] = await deps.db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return s
    ? { planId: s.planId as PlanId, status: s.status as Subscription['status'], period: s.period as Subscription['period'], renewsAt: s.renewsAt?.toISOString() ?? null, cancelAtPeriodEnd: s.cancelAtPeriodEnd }
    : { planId: 'free', status: 'active', period: 'monthly', renewsAt: null, cancelAtPeriodEnd: false };
};

meRoutes.get('/subscription', async (c) => c.json(await subscriptionOf(c.get('deps'), c.get('auth')!.user.id)));

meRoutes.get('/invoices', async (c) => {
  const rows = await c.get('deps').db.select().from(payments).where(eq(payments.userId, c.get('auth')!.user.id)).orderBy(desc(payments.createdAt)).limit(100);
  const invoices: Invoice[] = rows.map((p) => ({ id: p.id, date: p.createdAt.toISOString(), amount: p.amount, currency: p.currency, status: p.status as Invoice['status'], planId: p.planId as PlanId }));
  return c.json(invoices);
});

/** Honnête : tant qu'aucune passerelle de paiement n'est connectée, un changement d'offre ne peut pas aboutir. */
meRoutes.post('/subscription/change', async (c) => {
  await readJson(c, z.object({ planId: z.enum(['free', 'pro', 'business']), period: z.enum(['monthly', 'yearly']) }));
  const result: ChangePlanResult = { status: 'unavailable', reason: 'payments_not_connected' };
  return c.json(result);
});

const setCancel = async (c: C, cancel: boolean) => {
  const deps = c.get('deps');
  const userId = c.get('auth')!.user.id;
  const current = await subscriptionOf(deps, userId);
  if (current.planId === 'free') throw conflict('free_plan');
  await deps.db.update(subscriptions).set({ cancelAtPeriodEnd: cancel, updatedAt: deps.now() }).where(eq(subscriptions.userId, userId));
  return subscriptionOf(deps, userId);
};
meRoutes.post('/subscription/cancel', async (c) => c.json(await setCancel(c, true)));
meRoutes.post('/subscription/resume', async (c) => c.json(await setCancel(c, false)));

// — Brouillon de l'assistant de configuration (reprise sur n'importe quel appareil) —

meRoutes.get('/onboarding', async (c) => {
  const [row] = await c.get('deps').db.select({ state: users.onboardingState }).from(users).where(eq(users.id, c.get('auth')!.user.id)).limit(1);
  return c.json({ state: row?.state ?? null });
});

meRoutes.put('/onboarding', async (c) => {
  const body = await readJson(c, z.object({ state: z.record(z.string(), z.unknown()).nullable() }), 40_000);
  const deps = c.get('deps');
  await deps.db.update(users).set({ onboardingState: body.state, updatedAt: deps.now() }).where(eq(users.id, c.get('auth')!.user.id));
  return c.body(null, 204);
});

// — Images —

meRoutes.post('/media', async (c) => {
  const deps = c.get('deps');
  const userId = c.get('auth')!.user.id;
  if (Number(c.req.header('content-length') ?? 0) > MAX_IMAGE_BYTES + 100_000) throw new HttpError(413, 'file_too_large');
  await enforce(deps.db, keyFor('media', userId), 60, 3600, deps.now());
  const form = await c.req.parseBody().catch(() => null);
  const file = form?.file;
  if (!(file instanceof File)) throw badRequest('no_file');
  return c.json(await storeImage(deps, userId, Buffer.from(await file.arrayBuffer())), 201);
});
