import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { C, Deps, HonoEnv, UserRow } from '../context.js';
import { users } from '../db/schema.js';
import { hashPassword, needsRehash, verifyPassword } from '../lib/crypto.js';
import { nameFromEmail } from '../../src/utilities/validation.js';
import { badRequest, conflict, HttpError, unauthorized } from '../lib/errors.js';
import { audit, securityEvent } from '../lib/audit.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { readJson } from '../lib/request.js';
import { optionalAuth, requireAuth } from '../middleware.js';
import {
  assertCanSignIn, assertStrongPassword, maybeBootstrapAdmin, buildSession, checkOtp, consumeAuthToken, createAccount, dummyVerify, emailCodeKey, findUserByEmail, findUserByPhone, issueEmailCode, issueOtp,
  sendPasswordReset, sendVerificationEmail,
} from '../services/accounts.js';
import { challengedUser, enabledMethods, mfaChallenge, sendMfaCode, verifyMfa, type PrimaryFactor } from '../services/mfa.js';
import { accountDeletedMessage, passwordChangedMessage, securityNoticeMessage, welcomeSimpleMessage } from '../lib/emails.js';
import { confirmDeletion, deletionTarget } from '../services/account-deletion.js';
import { notify } from '../services/notifications.js';
import { clearSessionCookie, endSession, endUserSessions, loadSession, startSession } from '../services/sessions.js';
import { challengeBody, deleteCodeBody, deleteConfirmBody, emailCodeRequestBody, emailCodeVerifyBody, forgotBody, mfaSendBody, mfaVerifyBody, otpRequestBody, otpVerifyBody, phoneRequestBody, phoneResetBody, resetBody, signInBody, signUpBody, twoFactorBody, verifyEmailBody } from '../validation/auth.js';

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
  return finishSignIn(c, deps, user, 'password');
});

/**
 * Fin de la première étape de connexion. Quand une vérification en deux étapes est active (SMS, e-mail, application), le défi
 * est renvoyé à la place d'une session : la première étape seule n'ouvre RIEN. Sinon la session est ouverte (et une éventuelle
 * demande de suppression de compte est annulée : se reconnecter prouve que le compte est utilisé).
 */
async function finishSignIn(c: C, deps: Deps, user: UserRow, primary: PrimaryFactor) {
  const challenge = await mfaChallenge(c, deps, user, primary);
  if (challenge) return c.json({ twoFactor: challenge });
  return openSession(c, deps, user);
}

async function openSession(c: C, deps: Deps, user: UserRow) {
  await syncLocale(c, deps, user);
  if (user.deletionRequestedAt) {
    await deps.db.update(users).set({ deletionRequestedAt: null, deletionNotifiedAt: null, updatedAt: deps.now() }).where(eq(users.id, user.id));
    notify(deps, user, (to, name, locale) => securityNoticeMessage(to, name, 'deletion_cancelled', locale));
  }
  const expiresAt = await startSession(c, deps, user);
  return c.json(await buildSession(deps, user.id, expiresAt));
}

/** Seconde étape : code SMS / e-mail, code de l'application ou code de secours. */
authRoutes.post('/sign-in/mfa', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, mfaVerifyBody);
  const { user, primary } = await challengedUser(deps, body.challenge);
  await verifyMfa(c, deps, user, primary, body.method, body.code);
  return openSession(c, deps, user);
});

/** (Re)envoie le code d'une méthode choisie dans le défi (SMS ou e-mail). */
authRoutes.post('/sign-in/mfa/send', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, mfaSendBody);
  const { user, primary } = await challengedUser(deps, body.challenge);
  if (!enabledMethods(user).includes(body.method) || body.method === primary) throw unauthorized('invalid_challenge');
  const sent = await sendMfaCode(c, deps, user, body.method);
  if (!sent) throw badRequest('invalid');
  return c.json(sent);
});

// Anciennes routes de la double authentification par SMS (conservées pour les clients déjà ouverts).
authRoutes.post('/sign-in/2fa', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, twoFactorBody);
  const { user, primary } = await challengedUser(deps, body.challenge);
  await verifyMfa(c, deps, user, primary, 'sms', body.code);
  return openSession(c, deps, user);
});

authRoutes.post('/sign-in/2fa/resend', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, challengeBody);
  const { user } = await challengedUser(deps, body.challenge);
  const sent = await sendMfaCode(c, deps, user, 'sms');
  if (!sent) throw unauthorized('invalid_challenge');
  return c.json({ channel: 'sms', ...sent });
});

// — Connexion et inscription par code reçu par e-mail (aucun mot de passe) —

/** Réponse identique que l'adresse ait un compte ou non (les comptes suspendus ne reçoivent rien). */
authRoutes.post('/email-code/request', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, emailCodeRequestBody);
  const user = await findUserByEmail(deps.db, body.email);
  const issued = await issueEmailCode(c, deps, body.email, { silent: Boolean(user && user.status !== 'active'), locale: c.get('locale') });
  return c.json(issued);
});

/** Le code prouve la possession de l'adresse : il ouvre le compte existant, ou le crée (conditions acceptées). */
authRoutes.post('/email-code/verify', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, emailCodeVerifyBody);
  await checkOtp(c, deps, emailCodeKey(body.email), body.code);
  const now = deps.now();
  let user = await findUserByEmail(deps.db, body.email);
  if (user) {
    assertCanSignIn(user);
    if (!user.emailVerifiedAt) {
      await deps.db.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, user.id));
      await maybeBootstrapAdmin(deps, user.id);
      user = (await findUserByEmail(deps.db, body.email))!;
    }
    return finishSignIn(c, deps, user, 'email');
  }
  await enforce(deps.db, keyFor('signup-ip', c.get('ip')), 10, 3600, now);
  user = await createAccount(deps, { name: nameFromEmail(body.email), email: body.email, emailVerified: true, country: country(c), locale: c.get('locale') });
  await maybeBootstrapAdmin(deps, user.id);
  notify(deps, user, (to, name, locale) => welcomeSimpleMessage(to, name, `${deps.config.publicUrl}/onboarding`, locale));
  const expiresAt = await startSession(c, deps, user);
  return c.json(await buildSession(deps, user.id, expiresAt));
});

authRoutes.post('/sign-up', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, signUpBody);
  await enforce(deps.db, keyFor('signup-ip', c.get('ip')), 10, 3600, deps.now());
  assertStrongPassword(body.password, [body.email, body.email.split('@')[0] ?? '']);
  const user = await createAccount(deps, { name: body.name, email: body.email, password: body.password, country: country(c), locale: c.get('locale') });
  // Accueil seul, envoyé après la réponse (SMTP : plusieurs secondes). La confirmation de l'adresse est facultative (Sécurité).
  notify(deps, user, (to, name, locale) => welcomeSimpleMessage(to, name, `${deps.config.publicUrl}/onboarding`, locale));
  const expiresAt = await startSession(c, deps, user);
  return c.json(await buildSession(deps, user.id, expiresAt));
});

// — Confirmation finale de la suppression du compte (lien reçu par e-mail après 15 jours sans activité) —

authRoutes.post('/delete/target', async (c) => {
  const deps = c.get('deps');
  const { token } = await readJson(c, deleteCodeBody);
  await enforce(deps.db, keyFor('delete-ip', c.get('ip')), 30, 3600, deps.now());
  return c.json(await deletionTarget(deps, token));
});

/** Compte sans mot de passe : un code envoyé à son adresse tient lieu de confirmation. */
authRoutes.post('/delete/code', async (c) => {
  const deps = c.get('deps');
  const { token } = await readJson(c, deleteCodeBody);
  const info = await deletionTarget(deps, token);
  if (info.hasPassword || !info.contact.includes('@')) throw conflict('password_account');
  return c.json(await issueEmailCode(c, deps, info.contact, { locale: c.get('locale') }));
});

authRoutes.post('/delete/confirm', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, deleteConfirmBody);
  await enforce(deps.db, keyFor('delete-ip', c.get('ip')), 30, 3600, deps.now());
  const user = await confirmDeletion(c, deps, body.token, { password: body.password, code: body.code });
  notify(deps, user, accountDeletedMessage);
  return c.body(null, 204);
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
    return finishSignIn(c, deps, user, 'sms');
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

/**
 * Réinitialisation par SMS : la réponse est IDENTIQUE que le numéro ait un compte ou non (mêmes plafonds, aucun envoi
 * réel sans compte), et le SMS part après la réponse pour que la durée ne trahisse pas non plus l'existence du compte.
 */
authRoutes.post('/password/forgot-phone', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, phoneRequestBody);
  const user = await findUserByPhone(deps.db, body.phone);
  const eligible = Boolean(user && user.phoneVerifiedAt && user.passwordHash && user.status === 'active');
  const issued = await issueOtp(c, deps, body.phone, 'sms', { silent: !eligible, deferSend: true });
  return c.json({ channel: issued.channel, expiresInSec: issued.expiresInSec, resendInSec: issued.resendInSec, ...(issued.devCode ? { devCode: issued.devCode } : {}) });
});

authRoutes.post('/password/reset-phone', async (c) => {
  const deps = c.get('deps');
  const body = await readJson(c, phoneResetBody);
  assertStrongPassword(body.password); // avant de consommer le code : l'utilisateur peut corriger sans le perdre
  await checkOtp(c, deps, body.phone, body.code);
  const user = await findUserByPhone(deps.db, body.phone);
  if (!user || !user.phoneVerifiedAt || !user.passwordHash || user.status !== 'active') throw badRequest('no_account');
  const now = deps.now();
  await deps.db.update(users).set({ passwordHash: await hashPassword(body.password, deps.config.scryptLog2N), updatedAt: now }).where(eq(users.id, user.id));
  await endUserSessions(deps, user.id);
  await securityEvent(deps.db, { kind: 'password_reset', subject: user.phone ?? user.id, userId: user.id, ip: c.get('ip') }, now);
  notify(deps, user, passwordChangedMessage);
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
  await maybeBootstrapAdmin(deps, userId);
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
