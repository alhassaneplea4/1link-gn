/**
 * Sécurité du compte (sous /me) : vérification en deux étapes (SMS, e-mail, application d'authentification), codes de secours,
 * définition ou changement du mot de passe. Chaque opération exige une preuve d'identité récente (mot de passe ou code).
 */
import { Hono } from 'hono';
import { and, desc, eq, gt, like } from 'drizzle-orm';
import type { HonoEnv } from '../context.js';
import { sessions, users } from '../db/schema.js';
import { securityEvent } from '../lib/audit.js';
import { hashPassword } from '../lib/crypto.js';
import { describeRequest, securityNoticeMessage } from '../lib/emails.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { maskIp, readJson } from '../lib/request.js';
import { requireAuth } from '../middleware.js';
import { assertNotPwned, assertStrongPassword, buildSession, issueEmailCode } from '../services/accounts.js';
import { confirmIdentity } from '../services/identity.js';
import { beginTotpSetup, disableTotp, enabledMethods, finishTotpSetup, newRecoveryCodes } from '../services/mfa.js';
import { notify } from '../services/notifications.js';
import { clearSessionCookie, endUserSessions, markSessionFactor } from '../services/sessions.js';
import { identityBody, passkeyRegisterBody, setPasswordBody, toggleBody, totpEnableBody } from '../validation/auth.js';
import { beginRegistration, finishRegistration, listPasskeys, removePasskey } from '../services/passkeys.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

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
  return c.json(await buildSession(deps, auth.user.id, auth.expiresAt, auth.authFactor));
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
  // Le code de l'application vient d'être prouvé DANS cette session : elle devient une session à second facteur.
  await markSessionFactor(deps, auth.sessionId, 'mfa');
  return c.json({ recoveryCodes, session: await buildSession(deps, auth.user.id, auth.expiresAt, 'mfa') });
});

securityRoutes.post('/mfa/totp/disable', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  await confirmIdentity(c, deps, auth.user, await readJson(c, identityBody));
  await disableTotp(deps, auth.user.id);
  await log(c, auth.user.id, 'Application d’authentification désactivée');
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, 'mfa_totp_off', locale));
  return c.json(await buildSession(deps, auth.user.id, auth.expiresAt, auth.authFactor));
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
  await assertNotPwned(deps, body.newPassword);
  await confirmIdentity(c, deps, auth.user, body);
  await deps.db.update(users).set({ passwordHash: await hashPassword(body.newPassword, deps.config.scryptLog2N), updatedAt: deps.now() }).where(eq(users.id, auth.user.id));
  await endUserSessions(deps, auth.user.id, auth.sessionId);
  await log(c, auth.user.id, auth.user.passwordHash ? 'Mot de passe modifié' : 'Mot de passe défini');
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, 'password_set', locale));
  return c.json(await buildSession(deps, auth.user.id, auth.expiresAt, auth.authFactor));
});

// — Appareils connectés : voir les sessions ouvertes et en fermer —

/** Identifiant public d'une session : début de son empreinte (le jeton lui-même n'est jamais stocké, ni exposé). */
const handleOf = (id: string) => id.slice(0, 16);

securityRoutes.get('/sessions', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  const rows = await deps.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, auth.user.id), gt(sessions.expiresAt, deps.now())))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(50);
  return c.json(
    rows.map((r) => {
      const ctx = describeRequest(r.userAgent ?? '', r.country);
      return {
        id: handleOf(r.id), current: r.id === auth.sessionId, createdAt: r.createdAt.toISOString(), lastSeenAt: r.lastSeenAt.toISOString(),
        browser: ctx.browser, os: ctx.os, country: ctx.country, ip: maskIp(r.ip), factor: r.authFactor,
      };
    }),
  );
});

/** Ferme UNE session (la session courante se ferme comme une déconnexion). Aucune preuve d'identité : retirer un accès ne le rend pas plus faible. */
securityRoutes.delete('/sessions/:id', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  const handle = c.req.param('id');
  if (!/^[0-9a-f]{16}$/.test(handle)) throw notFound('session');
  const removed = await deps.db
    .delete(sessions)
    .where(and(eq(sessions.userId, auth.user.id), like(sessions.id, `${handle}%`)))
    .returning({ id: sessions.id });
  if (removed.length === 0) throw notFound('session');
  if (removed.some((r) => r.id === auth.sessionId)) clearSessionCookie(c, deps);
  await log(c, auth.user.id, 'Session fermée depuis la page Sécurité');
  return c.body(null, 204);
});

/** Ferme toutes les autres sessions (utile après un doute) ; la session courante reste ouverte. */
securityRoutes.post('/sessions/revoke-others', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  await endUserSessions(deps, auth.user.id, auth.sessionId);
  await log(c, auth.user.id, 'Toutes les autres sessions ont été fermées');
  return c.body(null, 204);
});

// — Clés d'accès (passkeys) —

securityRoutes.get('/passkeys', async (c) => c.json(await listPasskeys(c.get('deps'), c.get('auth')!.user.id)));

/** Étape 1 : options d'enrôlement. Preuve d'identité exigée : une session volée ne suffit pas à poser sa propre clé. */
securityRoutes.post('/passkeys/options', async (c) => {
  const deps = c.get('deps');
  const { user } = c.get('auth')!;
  const proof = await readJson(c, identityBody);
  await enforce(deps.db, keyFor('passkey-reg', user.id), 10, 3600, deps.now());
  await confirmIdentity(c, deps, user, proof);
  return c.json(await beginRegistration(deps, user));
});

/** Étape 2 : l'appareil a signé le défi (en vérifiant l'utilisateur). La session devient une session à second facteur. */
securityRoutes.post('/passkeys', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  const body = await readJson(c, passkeyRegisterBody);
  const passkey = await finishRegistration(deps, auth.user, body.handle, body.response as unknown as RegistrationResponseJSON, body.name);
  await markSessionFactor(deps, auth.sessionId, 'mfa');
  await log(c, auth.user.id, 'Clé d’accès ajoutée');
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, 'passkey_added', locale));
  return c.json({ passkey, session: await buildSession(deps, auth.user.id, auth.expiresAt, 'mfa') }, 201);
});

/** Retire une clé d'accès (preuve d'identité exigée). */
securityRoutes.post('/passkeys/:id/delete', async (c) => {
  const deps = c.get('deps');
  const auth = c.get('auth')!;
  await confirmIdentity(c, deps, auth.user, await readJson(c, identityBody));
  await removePasskey(deps, auth.user.id, c.req.param('id'));
  await log(c, auth.user.id, 'Clé d’accès retirée');
  notify(deps, auth.user, (to, name, locale) => securityNoticeMessage(to, name, 'passkey_removed', locale));
  return c.body(null, 204);
});
