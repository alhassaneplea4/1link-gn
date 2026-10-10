import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { C, Deps, HonoEnv, UserRow } from '../context.js';
import { users } from '../db/schema.js';
import { hashPassword, needsRehash, verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict, HttpError, unauthorized } from '../lib/errors.js';
import { audit, securityEvent } from '../lib/audit.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { readJson } from '../lib/request.js';
import { optionalAuth, requireAuth } from '../middleware.js';
import {
  assertCanSignIn, assertStrongPassword, buildSession, checkOtp, consumeAuthToken, createAccount, dummyVerify, findUserByEmail, findUserByPhone, issueOtp,
  sendPasswordReset, sendVerificationEmail,
} from '../services/accounts.js';
import { passwordChangedMessage } from '../lib/emails.js';
import { notify } from '../services/notifications.js';
import { clearSessionCookie, endSession, endUserSessions, loadSession, startSession } from '../services/sessions.js';
import { forgotBody, otpRequestBody, otpVerifyBody, resetBody, signInBody, signUpBody, verifyEmailBody } from '../validation/auth.js';

export const authRoutes = new Hono<HonoEnv>();

/** La langue du compte suit celle de l'interface à la connexion (les e-mails suivent la langue choisie par l'utilisateur). */
async function syncLocale(c: C, deps: Deps, user: UserRow) {
  const locale = c.get('locale');
  if (c.req.header('accept-language') && user.locale !== locale) await deps.db.update(users).set({ locale }).where(eq(users.id, user.id));
}

const country = (c: { req: { header(n: string): string | undefined } }) => c.req.header('x-vercel-ip-country')?.toUpperCase().slice(0, 2) ?? null;

/** Session courante, ou `null` (réponse 200) : « non connecté » n'est pas une erreur pour l'interface. */
authRoutes.get('/session', async (c) => {
  const deps = c.get('deps');
  const s = await loadSession(c, deps);
  if (!s) return c.json(null);
  return c.json(await buildSession(deps, s.user.id, s.expiresAt));
});

authRoutes.post('/sign-in', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, signInBody);
  const now = deps.now();
  const ip = c.get('ip');
  await enforce(deps.db, keyFor('signin-ip', ip), 100, 3600, now);
  await enforce(deps.db, keyFor('signin-email', body.email), 20, 3600, now);
  await enforce(deps.db, keyFor('signin-pair', ip, body.email), 10, 900, now);

  const user = await findUserByEmail(deps.db, body.email);
  const valid = user?.passwordHash ? await verifyPassword(body.password, user.passwordHash) : (await dummyVerify(deps, body.password), false);
  if (!user || !valid) {
    await securityEvent(deps.db, { kind: 'failed_login', subject: body.email, userId: user?.id ?? null, ip }, now);
    throw unauthorized('invalid_credentials');
  }
  assertCanSignIn(user);
  if (user.passwordHash && needsRehash(user.passwordHash, deps.config.scryptLog2N)) {
    await deps.db.update(users).set({ passwordHash: await hashPassword(body.password, deps.config.scryptLog2N) }).where(eq(users.id, user.id));
  }
  await syncLocale(c, deps, user);
  const expiresAt = await startSession(c, deps, user);
  return c.json(await buildSession(deps, user.id, expiresAt));
});

authRoutes.post('/sign-up', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, signUpBody);
  await enforce(deps.db, keyFor('signup-ip', c.get('ip')), 10, 3600, deps.now());
  assertStrongPassword(body.password, [body.email, body.email.split('@')[0] ?? '']);
  const user = await createAccount(deps, { name: body.name, email: body.email, password: body.password, country: country(c), locale: c.get('locale') });
  await sendVerificationEmail(c, deps, user, true);
  const expiresAt = await startSession(c, deps, user);
  return c.json(await buildSession(deps, user.id, expiresAt));
});

authRoutes.post('/sign-out', optionalAuth, async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth');
  if (auth) await endSession(deps, auth.sessionId);
  clearSessionCookie(c, deps);
  return c.body(null, 204);
});

authRoutes.post('/otp/request', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, otpRequestBody);
  return c.json(await issueOtp(c, deps, body.phone, body.channel));
});

/** Ne révèle l'existence d'un compte qu'APRÈS la preuve de possession du numéro (code correct). */
authRoutes.post('/otp/verify', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, otpVerifyBody);
  await checkOtp(c, deps, body.phone, body.code);
  const now = deps.now();

  if (body.mode === 'sign_in') {
    const user = await findUserByPhone(deps.db, body.phone);
    if (!user) throw new HttpError(404, 'no_account');
    assertCanSignIn(user);
    if (!user.phoneVerifiedAt) await deps.db.update(users).set({ phoneVerifiedAt: now, updatedAt: now }).where(eq(users.id, user.id));
    const expiresAt = await startSession(c, deps, user);
    return c.json(await buildSession(deps, user.id, expiresAt));
  }

  if (await findUserByPhone(deps.db, body.phone)) throw conflict('phone_taken');
  if (!body.name?.trim() || body.acceptTerms !== true) throw badRequest('invalid');
  const user = await createAccount(deps, { name: body.name, phone: body.phone, phoneVerified: true, country: country(c), locale: c.get('locale') });
  const expiresAt = await startSession(c, deps, user);
  return c.json(await buildSession(deps, user.id, expiresAt));
});

/** Réponse identique que le compte existe ou non ; l'envoi se fait hors du chemin de réponse (même durée dans les deux cas). */
authRoutes.post('/password/forgot', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, forgotBody);
  const now = deps.now();
  await enforce(deps.db, keyFor('forgot-ip', c.get('ip')), 10, 3600, now);
  await enforce(deps.db, keyFor('forgot-email', body.email), 3, 3600, now);
  const user = await findUserByEmail(deps.db, body.email);
  if (user && user.status === 'active') deps.defer(sendPasswordReset(c, deps, user).catch((e) => console.error('[auth] reset :', (e as Error).message)));
  return c.body(null, 204);
});

authRoutes.post('/password/reset', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, resetBody);
  await enforce(deps.db, keyFor('reset-ip', c.get('ip')), 20, 3600, deps.now());
  assertStrongPassword(body.password); // avant de consommer le jeton : l'utilisateur peut corriger sans le perdre
  const userId = await consumeAuthToken(deps, body.token, 'password_reset');
  const now = deps.now();
  const [user] = await deps.db.update(users).set({ passwordHash: await hashPassword(body.password, deps.config.scryptLog2N), updatedAt: now }).where(eq(users.id, userId)).returning();
  if (user) notify(deps, user, passwordChangedMessage);
  await endUserSessions(deps, userId); // toute session ouverte avec l'ancien mot de passe est révoquée
  await securityEvent(deps.db, { kind: 'password_reset', subject: user?.email ?? userId, userId, ip: c.get('ip') }, now);
  return c.body(null, 204);
});

/** Valide l'adresse. Renvoie la session SEULEMENT si le lien est ouvert dans la session du même compte (pas de connexion par lien). */
authRoutes.post('/email/verify', optionalAuth, async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, verifyEmailBody);
  await enforce(deps.db, keyFor('verify-ip', c.get('ip')), 30, 3600, deps.now());
  const userId = await consumeAuthToken(deps, body.token, 'email_verify');
  const now = deps.now();
  await deps.db.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, userId));
  await audit(deps.db, { actorId: userId, actorLabel: 'Système', action: 'E-mail vérifié', target: userId, ip: c.get('ip') }, now);
  const auth = c.get('auth');
  return c.json(auth && auth.user.id === userId ? await buildSession(deps, userId, auth.expiresAt) : null);
});

authRoutes.post('/email/resend', requireAuth, async (c) => {
  const deps = c.get('deps');
  const { user } = c.get('auth')!;
  await enforce(deps.db, keyFor('resend-verify', user.id), 3, 3600, deps.now());
  if (!user.email || user.emailVerifiedAt) return c.body(null, 204);
  if (!(await sendVerificationEmail(c, deps, user))) throw new HttpError(503, 'mail_unavailable');
  return c.body(null, 204);
});
