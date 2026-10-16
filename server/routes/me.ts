import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { C, HonoEnv } from '../context.js';
import { payments, subscriptions, users } from '../db/schema.js';
import { conflict, HttpError, badRequest } from '../lib/errors.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { readJson } from '../lib/request.js';
import { requireAuth } from '../middleware.js';
import { checkOtp, issueOtp, buildSession, uniqueViolation } from '../services/accounts.js';
import { notify } from '../services/notifications.js';
import { securityNoticeMessage } from '../lib/emails.js';
import { verifyPassword } from '../lib/crypto.js';
import { securityEvent } from '../lib/audit.js';
import { accountDeleteBody, phoneLinkVerifyBody, phoneRequestBody, passwordConfirmBody, twoFactorToggleBody } from '../validation/auth.js';
import { deleteAccount } from '../services/account-deletion.js';
import { accountDeletedMessage } from '../lib/emails.js';
import { clearSessionCookie } from '../services/sessions.js';
import { MAX_DOC_BYTES, pageInput } from '../validation/page.js';
import { badgesOf, getOwnerPage, ownerDocument, unpublish, writePage } from '../services/pages.js';
import { getVerificationState, requestVerification, verificationInput } from '../services/verification.js';
import { userReport } from '../services/analytics.js';
import { storeImage, MAX_IMAGE_BYTES } from '../services/media.js';
import { requestPlan, subscriptionOf } from '../services/billing.js';
import { badgePlanOf } from '../services/access.js';
import type { ChangePlanResult, Invoice } from '../../src/models/billing.js';
import type { RangePreset } from '../../src/models/analytics.js';
import type { PlanId } from '../../src/models/auth.js';

export const meRoutes = new Hono<HonoEnv>();
meRoutes.use('*', requireAuth);

// — Page —

meRoutes.get('/page', async (c) => {
  const { user } = c.get('auth')!;
  const row = await getOwnerPage(c.get('deps'), user.id);
  return c.json(row ? ownerDocument(row, badgesOf(user, badgePlanOf(c.get('auth')!.access))) : null);
});

meRoutes.put('/page/draft', async (c) => {
  const deps = c.get('deps');
  const input = await readJson(c, pageInput('draft'), MAX_DOC_BYTES + 50_000);
  return c.json(await writePage(deps, c.get('auth')!, input, { publish: false }));
});

meRoutes.post('/page/publish', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
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

meRoutes.get('/subscription', async (c) => c.json(await subscriptionOf(c.get('deps'), c.get('auth')!.user.id)));

meRoutes.get('/invoices', async (c) => {
  const rows = await c.get('deps').db.select().from(payments).where(eq(payments.userId, c.get('auth')!.user.id)).orderBy(desc(payments.createdAt)).limit(100);
  const invoices: Invoice[] = rows.map((p) => ({ id: p.id, date: p.createdAt.toISOString(), amount: p.amount, currency: p.currency, status: p.status as Invoice['status'], planId: p.planId as PlanId }));
  return c.json(invoices);
});

/** Souscrire ouvre l'essai de 15 jours (une seule fois) ; ensuite, le paiement est confirmé par l'équipe — aucun paiement n'est simulé. */
meRoutes.post('/subscription/change', async (c) => {
  const body = await readJson(c, z.object({ planId: z.enum(['basic', 'pro', 'business']), period: z.enum(['monthly', 'yearly']) }));
  const result: ChangePlanResult = await requestPlan(c.get('deps'), c.get('auth')!, body.planId, body.period);
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

// — Téléphone et double authentification par SMS —

/** Re-saisie du mot de passe avant une opération sensible (plafonnée : 10 essais / 15 min). */
async function confirmPassword(c: C, password: string): Promise<void> {
  const deps = c.get('deps');
  const { user } = c.get('auth')!;
  await enforce(deps.db, keyFor('pw-confirm', user.id), 10, 900, deps.now());
  if (!user.passwordHash) throw conflict('no_password');
  if (!(await verifyPassword(password, user.passwordHash))) {
    await securityEvent(deps.db, { kind: 'failed_login', subject: user.email ?? user.id, userId: user.id, ip: c.get('ip') }, deps.now());
    throw badRequest('wrong_password', { password: 'wrong' });
  }
}

/** Étape 1 : envoie un code au numéro à associer au compte. */
meRoutes.post('/phone/request', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, phoneRequestBody);
  const issued = await issueOtp(c, deps, body.phone, body.channel);
  return c.json(issued);
});

/** Étape 2 : la preuve de possession (code correct) associe et valide le numéro. */
meRoutes.post('/phone/verify', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  const body = await readJson(c, phoneLinkVerifyBody);
  await checkOtp(c, deps, body.phone, body.code);
  const now = deps.now();
  try {
    await deps.db.update(users).set({ phone: body.phone, phoneVerifiedAt: now, updatedAt: now }).where(eq(users.id, auth.user.id));
  } catch (e) {
    if (uniqueViolation(e)) throw conflict('phone_taken');
    throw e;
  }
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, 'phone_linked', locale));
  return c.json(await buildSession(deps, auth.user.id, auth.expiresAt));
});

/** Retire le numéro (et la double authentification). Impossible s'il est le seul moyen de connexion du compte. */
meRoutes.post('/phone/remove', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  const { password } = await readJson(c, passwordConfirmBody);
  if (!auth.user.phone) throw new HttpError(404, 'no_phone');
  if (!auth.user.email) throw conflict('only_login');
  await confirmPassword(c, password);
  const now = deps.now();
  await deps.db.update(users).set({ phone: null, phoneVerifiedAt: null, twoFactorSms: false, updatedAt: now }).where(eq(users.id, auth.user.id));
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, 'phone_removed', locale));
  return c.json(await buildSession(deps, auth.user.id, auth.expiresAt));
});

/** Active ou désactive la double authentification par SMS (mot de passe exigé ; numéro vérifié requis pour l'activer). */
meRoutes.post('/2fa', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  const body = await readJson(c, twoFactorToggleBody);
  await confirmPassword(c, body.password);
  if (body.enabled && !auth.user.phoneVerifiedAt) throw badRequest('phone_required');
  const now = deps.now();
  await deps.db.update(users).set({ twoFactorSms: body.enabled, updatedAt: now }).where(eq(users.id, auth.user.id));
  await securityEvent(deps.db, { kind: 'new_device', subject: body.enabled ? 'Double authentification activée' : 'Double authentification désactivée', userId: auth.user.id, ip: c.get('ip') }, now);
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, body.enabled ? 'two_factor_on' : 'two_factor_off', locale));
  return c.json(await buildSession(deps, auth.user.id, auth.expiresAt));
});

// — Suppression du compte —

/** Compte créé par téléphone (sans mot de passe) : un code SMS prouve que c'est bien le titulaire. */
meRoutes.post('/delete/request', async (c) => {
  const deps = c.get('deps');
  const { user } = c.get('auth')!;
  if (user.passwordHash || !user.phone) throw conflict('password_account');
  return c.json(await issueOtp(c, deps, user.phone, 'sms'));
});

/** Efface définitivement le compte et ses données. Exige le mot de passe (ou, sans mot de passe, le code reçu par SMS). */
meRoutes.post('/delete', async (c) => {
  const deps = c.get('deps');
  const { user } = c.get('auth')!;
  const body = await readJson(c, accountDeleteBody);
  if (user.passwordHash) {
    if (!body.password) throw badRequest('password_required', { password: 'required' });
    await confirmPassword(c, body.password);
  } else {
    if (!body.code || !user.phone) throw badRequest('code_required', { code: 'required' });
    await checkOtp(c, deps, user.phone, body.code);
  }
  await deleteAccount(deps, user, c.get('ip'));
  notify(deps, user, accountDeletedMessage);
  clearSessionCookie(c, deps);
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
