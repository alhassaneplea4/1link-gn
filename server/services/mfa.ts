/**
 * Vérification en deux étapes (MFA) : SMS, e-mail, application d'authentification (TOTP) et codes de secours.
 * Tout est désactivé par défaut. La première étape (mot de passe, code e-mail ou code SMS) ne suffit pas à ouvrir une session
 * quand au moins une méthode est active : un défi signé de 10 minutes lie la seconde étape à la première.
 */
import { eq } from 'drizzle-orm';
import type { C, Deps, UserRow } from '../context.js';
import { users } from '../db/schema.js';
import { decryptSecret, encryptSecret, newToken, safeEqual, sha256, signPayload, verifyPayload } from '../lib/crypto.js';
import { badRequest, HttpError, unauthorized } from '../lib/errors.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { newTotpSecret, otpauthUri, verifyTotp } from '../lib/totp.js';
import { maskPhone } from '../../src/utilities/phone.js';
import { maskEmail } from '../../src/utilities/validation.js';
import type { MfaMethod, TwoFactorChallenge } from '../../src/models/auth.js';
import { checkOtp, emailCodeKey, issueEmailCode, issueOtp } from './accounts.js';

export const CHALLENGE_TTL_MS = 10 * 60_000;
export const RECOVERY_CODE_COUNT = 8;

/** Première étape déjà franchie : sa méthode n'est pas redemandée comme seconde étape. */
export type PrimaryFactor = 'password' | 'email' | 'sms';

export function enabledMethods(user: UserRow): MfaMethod[] {
  const out: MfaMethod[] = [];
  if (user.twoFactorSms && user.phone && user.phoneVerifiedAt) out.push('sms');
  if (user.twoFactorEmail && user.email) out.push('email');
  if (user.totpEnabledAt && user.totpSecret) out.push('totp');
  return out;
}

export const mfaFlags = (user: UserRow) => {
  const m = enabledMethods(user);
  return { sms: m.includes('sms'), email: m.includes('email'), totp: m.includes('totp') };
};

/** Méthodes réellement proposées après une première étape donnée. */
function offered(user: UserRow, primary: PrimaryFactor): MfaMethod[] {
  return enabledMethods(user).filter((m) => !(primary === 'email' && m === 'email') && !(primary === 'sms' && m === 'sms'));
}

const PREFERRED: MfaMethod[] = ['totp', 'sms', 'email'];

/** Envoie le code de la méthode demandée (SMS ou e-mail). Pour TOTP, rien à envoyer : le code est dans l'application. */
export async function sendMfaCode(c: C, deps: Deps, user: UserRow, method: MfaMethod): Promise<{ expiresInSec: number; resendInSec: number; devCode?: string } | null> {
  if (method === 'sms' && user.phone) {
    const issued = await issueOtp(c, deps, user.phone, 'sms');
    return { expiresInSec: issued.expiresInSec, resendInSec: issued.resendInSec, ...(issued.devCode ? { devCode: issued.devCode } : {}) };
  }
  if (method === 'email' && user.email) return issueEmailCode(c, deps, user.email, { locale: user.locale === 'en' ? 'en' : 'fr' });
  return null;
}

/** Retourne le défi à présenter, ou `null` quand aucune seconde étape n'est nécessaire. */
export async function mfaChallenge(c: C, deps: Deps, user: UserRow, primary: PrimaryFactor): Promise<TwoFactorChallenge | null> {
  const methods = offered(user, primary);
  if (methods.length === 0) return null;
  const method = PREFERRED.find((m) => methods.includes(m)) ?? methods[0]!;
  const sent = await sendMfaCode(c, deps, user, method);
  const challenge = signPayload(deps.config.secret, { uid: user.id, k: 'mfa', p: primary }, CHALLENGE_TTL_MS, deps.now());
  return {
    challenge, methods, method,
    ...(methods.includes('sms') && user.phone ? { phoneMasked: maskPhone(user.phone), channel: 'sms' as const } : {}),
    ...(methods.includes('email') && user.email ? { emailMasked: maskEmail(user.email) } : {}),
    expiresInSec: sent?.expiresInSec ?? 0, resendInSec: sent?.resendInSec ?? 30,
    ...(sent?.devCode ? { devCode: sent.devCode } : {}),
  };
}

/** Lit le défi signé et retourne le compte concerné (actif) avec la première étape déjà franchie. */
export async function challengedUser(deps: Deps, challenge: string): Promise<{ user: UserRow; primary: PrimaryFactor }> {
  const claims = verifyPayload<{ uid: string; k: string; p?: PrimaryFactor }>(deps.config.secret, challenge, deps.now());
  if (!claims || (claims.k !== 'mfa' && claims.k !== '2fa')) throw unauthorized('invalid_challenge');
  const [user] = await deps.db.select().from(users).where(eq(users.id, claims.uid)).limit(1);
  if (!user || user.status !== 'active') throw unauthorized('invalid_challenge');
  return { user, primary: claims.p ?? 'password' };
}

const hashRecovery = (code: string) => sha256(`recovery:${code.replace(/[\s-]/g, '').toUpperCase()}`);

/** Vérifie la seconde étape. Les erreurs ne distinguent pas « mauvais code » de « méthode inactive ». */
export async function verifyMfa(c: C, deps: Deps, user: UserRow, primary: PrimaryFactor, method: MfaMethod | 'recovery', code: string): Promise<void> {
  const allowed = offered(user, primary);
  if (method === 'recovery') {
    if (!allowed.includes('totp')) throw unauthorized('invalid_challenge');
    await enforce(deps.db, keyFor('mfa-recovery', user.id), 10, 900, deps.now());
    const hash = hashRecovery(code);
    const all = user.recoveryCodes ?? [];
    const left = all.filter((h) => !safeEqual(h, hash));
    if (left.length === all.length) throw new HttpError(422, 'invalid_code', { attemptsLeft: '0' });
    await deps.db.update(users).set({ recoveryCodes: left, updatedAt: deps.now() }).where(eq(users.id, user.id));
    return;
  }
  if (!allowed.includes(method)) throw unauthorized('invalid_challenge');
  if (method === 'sms') return checkOtp(c, deps, user.phone!, code);
  if (method === 'email') return checkOtp(c, deps, emailCodeKey(user.email!), code);
  await verifyTotpFor(deps, user, code);
}

export async function verifyTotpFor(deps: Deps, user: UserRow, code: string): Promise<void> {
  await enforce(deps.db, keyFor('mfa-totp', user.id), 10, 900, deps.now(), 'too_many_attempts');
  const secret = user.totpSecret ? decryptSecret(deps.config.secret, user.totpSecret) : null;
  if (!secret || !verifyTotp(secret, code, deps.now())) throw new HttpError(422, 'invalid_code', { attemptsLeft: '0' });
}

// — Gestion depuis la page Sécurité —

export function newRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = newToken().replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10).padEnd(10, 'X');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, hashes: plain.map(hashRecovery) };
}

/** Prépare l'association d'une application : le secret est enregistré (chiffré) mais reste inactif jusqu'à la preuve d'un premier code. */
export async function beginTotpSetup(deps: Deps, user: UserRow): Promise<{ secret: string; uri: string }> {
  if (user.totpEnabledAt) throw badRequest('already_enabled');
  const secret = newTotpSecret();
  await deps.db.update(users).set({ totpSecret: encryptSecret(deps.config.secret, secret), totpEnabledAt: null, updatedAt: deps.now() }).where(eq(users.id, user.id));
  return { secret, uri: otpauthUri(secret, user.email ?? user.phone ?? user.id) };
}

/** Active TOTP quand le premier code saisi est correct ; retourne les codes de secours (affichés UNE seule fois). */
export async function finishTotpSetup(deps: Deps, user: UserRow, code: string): Promise<string[]> {
  if (user.totpEnabledAt) throw badRequest('already_enabled');
  if (!user.totpSecret) throw badRequest('setup_required');
  await verifyTotpFor(deps, user, code);
  const { plain, hashes } = newRecoveryCodes();
  await deps.db.update(users).set({ totpEnabledAt: deps.now(), recoveryCodes: hashes, updatedAt: deps.now() }).where(eq(users.id, user.id));
  return plain;
}

export async function disableTotp(deps: Deps, userId: string): Promise<void> {
  await deps.db.update(users).set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: null, updatedAt: deps.now() }).where(eq(users.id, userId));
}
