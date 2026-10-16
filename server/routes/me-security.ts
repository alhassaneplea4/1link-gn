/**
 * Sécurité du compte (sous /me) : vérification en deux étapes (SMS, e-mail, application d'authentification), codes de secours,
 * définition ou changement du mot de passe. Chaque opération exige une preuve d'identité récente (mot de passe ou code).
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { HonoEnv } from '../context.js';
import { users } from '../db/schema.js';
import { securityEvent } from '../lib/audit.js';
import { hashPassword } from '../lib/crypto.js';
import { securityNoticeMessage } from '../lib/emails.js';
import { badRequest, conflict } from '../lib/errors.js';
import { readJson } from '../lib/request.js';
import { requireAuth } from '../middleware.js';
import { assertStrongPassword, buildSession, issueEmailCode } from '../services/accounts.js';
import { confirmIdentity } from '../services/identity.js';
import { beginTotpSetup, disableTotp, enabledMethods, finishTotpSetup, newRecoveryCodes } from '../services/mfa.js';
import { notify } from '../services/notifications.js';
import { endUserSessions } from '../services/sessions.js';
import { identityBody, setPasswordBody, toggleBody, totpEnableBody } from '../validation/auth.js';

export const securityRoutes = new Hono<HonoEnv>();
securityRoutes.use('*', requireAuth);

const log = (c: { get(k: 'deps'): import('../context.js').Deps; get(k: 'ip'): string }, userId: string, subject: string) =>
  securityEvent(c.get('deps').db, { kind: 'new_device', subject, userId, ip: c.get('ip') }, c.get('deps').now());

/** État des méthodes (aucune n'est active tant que la personne ne l'a pas choisi). */
securityRoutes.get('/mfa', async (c) => {
  const { user } = c.get('auth')!;
  const methods = enabledMethods(user);
  return c.json({
    sms: { enabled: methods.includes('sms'), phoneVerified: Boolean(user.phone && user.phoneVerifiedAt) },
    email: { enabled: methods.includes('email'), available: Boolean(user.email) },
    totp: { enabled: methods.includes('totp') },
    recoveryLeft: user.totpEnabledAt ? (user.recoveryCodes ?? []).length : 0,
    hasPassword: user.passwordHash !== null,
  });
});

/** Active / désactive la vérification par e-mail. */
securityRoutes.post('/mfa/email', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  const body = await readJson(c, toggleBody);
  if (!auth.user.email) throw badRequest('email_required');
  if (body.enabled && !auth.user.emailVerifiedAt) throw badRequest('email_unverified');
  await confirmIdentity(c, deps, auth.user, body);
  await deps.db.update(users).set({ twoFactorEmail: body.enabled, updatedAt: deps.now() }).where(eq(users.id, auth.user.id));
  await log(c, auth.user.id, body.enabled ? 'Vérification par e-mail activée' : 'Vérification par e-mail désactivée');
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, body.enabled ? 'mfa_email_on' : 'mfa_email_off', locale));
  return c.json(await buildSession(deps, auth.user.id, auth.expiresAt));
});

/** Étape 1 de l'association d'une application : génère le secret (affiché une seule fois, avec l'adresse otpauth pour le QR code). */
securityRoutes.post('/mfa/totp/setup', async (c) => {
  const deps = c.get('deps');
  const { user } = c.get('auth')!;
  await confirmIdentity(c, deps, user, await readJson(c, identityBody));
  return c.json(await beginTotpSetup(deps, user));
});

/** Étape 2 : le premier code de l'application prouve l'association ; les codes de secours sont montrés UNE seule fois. */
securityRoutes.post('/mfa/totp/enable', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  const { code } = await readJson(c, totpEnableBody);
  const recoveryCodes = await finishTotpSetup(deps, auth.user, code);
  await log(c, auth.user.id, 'Application d’authentification activée');
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, 'mfa_totp_on', locale));
  return c.json({ recoveryCodes, session: await buildSession(deps, auth.user.id, auth.expiresAt) });
});

securityRoutes.post('/mfa/totp/disable', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  await confirmIdentity(c, deps, auth.user, await readJson(c, identityBody));
  await disableTotp(deps, auth.user.id);
  await log(c, auth.user.id, 'Application d’authentification désactivée');
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, 'mfa_totp_off', locale));
  return c.json(await buildSession(deps, auth.user.id, auth.expiresAt));
});

/** Nouveaux codes de secours (les anciens sont invalidés). */
securityRoutes.post('/mfa/recovery', async (c) => {
  const deps = c.get('deps');
  const { user } = c.get('auth')!;
  if (!user.totpEnabledAt) throw conflict('totp_required');
  await confirmIdentity(c, deps, user, await readJson(c, identityBody));
  const { plain, hashes } = newRecoveryCodes();
  await deps.db.update(users).set({ recoveryCodes: hashes, updatedAt: deps.now() }).where(eq(users.id, user.id));
  return c.json({ recoveryCodes: plain });
});

/** Envoie un code à l'adresse du compte (confirmation d'identité sans mot de passe). */
securityRoutes.post('/mfa/email/code', async (c) => {
  const { user } = c.get('auth')!;
  if (!user.email) throw badRequest('email_required');
  return c.json(await issueEmailCode(c, c.get('deps'), user.email, { locale: user.locale === 'en' ? 'en' : 'fr' }));
});

/** Définit (compte créé par code) ou change le mot de passe. Les autres sessions sont fermées. */
securityRoutes.post('/password', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  const body = await readJson(c, setPasswordBody);
  assertStrongPassword(body.newPassword, [auth.user.email ?? '', (auth.user.email ?? '').split('@')[0] ?? '']);
  await confirmIdentity(c, deps, auth.user, body);
  await deps.db.update(users).set({ passwordHash: await hashPassword(body.newPassword, deps.config.scryptLog2N), updatedAt: deps.now() }).where(eq(users.id, auth.user.id));
  await endUserSessions(deps, auth.user.id, auth.sessionId);
  await log(c, auth.user.id, auth.user.passwordHash ? 'Mot de passe modifié' : 'Mot de passe défini');
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, 'password_set', locale));
  return c.json(await buildSession(deps, auth.user.id, auth.expiresAt));
});
