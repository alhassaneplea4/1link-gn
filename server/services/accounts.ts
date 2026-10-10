/** Comptes : création, mots de passe, jetons à usage unique (e-mail, réinitialisation) et codes OTP. */
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { C, Deps, UserRow } from '../context.js';
import { authTokens, otpCodes, pages, subscriptions, users } from '../db/schema.js';
import type { Executor } from '../db/client.js';
import { hashPassword, hmac, newId, newToken, randomCode, safeEqual, sha256, verifyPassword } from '../lib/crypto.js';
import { activity } from '../lib/audit.js';
import { badRequest, conflict, forbidden, HttpError, tooMany } from '../lib/errors.js';
import { enforce, hit, keyFor } from '../lib/ratelimit.js';
import { pickLocale, resetPasswordMessage, verifyEmailMessage } from '../lib/emails.js';
import { toSession } from './sessions.js';
import type { PlanId, Session, SessionUser } from '../../src/models/auth.js';
import type { OtpChannel } from '../../src/models/auth.js';

export const OTP_TTL_SEC = 300;
export const OTP_RESEND_SEC = 30;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 5;
const VERIFY_TOKEN_TTL_MS = 24 * 3_600_000;
const RESET_TOKEN_TTL_MS = 3_600_000;

/** Erreur PostgreSQL « violation d'unicité » (code 23505), éventuellement enveloppée par le pilote. */
export function uniqueViolation(e: unknown): string | null {
  for (let err: unknown = e, depth = 0; err && depth < 4; depth++) {
    const x = err as { code?: string; constraint?: string; cause?: unknown };
    if (x.code === '23505') return x.constraint ?? 'unique';
    err = x.cause;
  }
  return null;
}

const COMMON_PASSWORDS = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyuiop', 'azertyuiop', 'motdepasse', 'motdepasse1', 'motdepasse123', '11111111', '00000000', 'iloveyou', 'abcd1234', 'azerty123']);

/** Politique : 8 à 200 caractères, pas dans une liste de mots de passe triviaux, pas l'identifiant du compte. */
export function assertStrongPassword(password: string, identity: string[] = []) {
  const p = password.normalize('NFKC');
  const lower = p.toLowerCase();
  if (p.length < 8 || p.length > 200 || COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(p) || identity.some((i) => i && lower === i.toLowerCase())) throw badRequest('weak_password', { password: 'weak' });
}

let dummyHash: Promise<string> | null = null;
/** Hash factice : un e-mail inconnu coûte autant de temps qu'un e-mail connu (pas d'énumération par le chronomètre). */
export const dummyVerify = async (deps: Deps, password: string) => {
  dummyHash ??= hashPassword('dummy-password', deps.config.scryptLog2N);
  await verifyPassword(password, await dummyHash);
};

export async function findUserByEmail(db: Executor, email: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return row ?? null;
}
export async function findUserByPhone(db: Executor, phone: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return row ?? null;
}

export interface NewAccount {
  name: string;
  email?: string;
  phone?: string;
  password?: string;
  phoneVerified?: boolean;
  country?: string | null;
}

/** Crée l'utilisateur et son abonnement gratuit de façon atomique. */
export async function createAccount(deps: Deps, input: NewAccount): Promise<UserRow> {
  const now = deps.now();
  const passwordHash = input.password ? await hashPassword(input.password, deps.config.scryptLog2N) : null;
  try {
    return await deps.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          id: newId('usr'), email: input.email?.trim().toLowerCase() ?? null, phone: input.phone ?? null, passwordHash, name: input.name.trim(),
          phoneVerifiedAt: input.phoneVerified ? now : null, country: input.country ?? null, termsAcceptedAt: now, createdAt: now, updatedAt: now,
        })
        .returning();
      await tx.insert(subscriptions).values({ id: newId('sub'), userId: user!.id, planId: 'free', status: 'active', startedAt: now, updatedAt: now });
      await activity(tx, 'signup', user!.name, now);
      return user!;
    });
  } catch (e) {
    const constraint = uniqueViolation(e);
    if (constraint?.includes('phone')) throw conflict('phone_taken');
    if (constraint) throw conflict('email_taken', { email: 'taken' });
    throw e;
  }
}

/** Construit la session à partir de l'état COURANT de la base (e-mail vérifié, plan, pseudonyme…). */
export async function buildSession(deps: Deps, userId: string, expiresAt: Date): Promise<Session> {
  const [row] = await deps.db
    .select({ u: users, username: pages.username, planId: subscriptions.planId, subStatus: subscriptions.status })
    .from(users)
    .leftJoin(pages, eq(pages.userId, users.id))
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new HttpError(401, 'no_session');
  const paid = row.subStatus === 'active' || row.subStatus === 'trialing' || row.subStatus === 'past_due';
  return toSession({ user: row.u, username: row.username, planId: (paid ? row.planId : 'free') as PlanId }, expiresAt);
}

export type { SessionUser };
export const assertCanSignIn = (user: UserRow) => {
  if (user.status !== 'active') throw forbidden('account_suspended');
};

// — Jetons à usage unique —

export async function issueAuthToken(db: Executor, userId: string, kind: 'email_verify' | 'password_reset', now: Date): Promise<string> {
  const token = newToken();
  await db.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)));
  await db.insert(authTokens).values({
    id: newId('tok'), userId, kind, tokenHash: sha256(token), createdAt: now,
    expiresAt: new Date(now.getTime() + (kind === 'email_verify' ? VERIFY_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS)),
  });
  return token;
}

/** Consomme le jeton (une seule fois). `invalid_token` s'il est inconnu, `token_expired` s'il est périmé ou déjà utilisé. */
export async function consumeAuthToken(deps: Deps, token: string, kind: 'email_verify' | 'password_reset'): Promise<string> {
  const now = deps.now();
  const result = await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(authTokens).where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.kind, kind))).for('update').limit(1);
    if (!row) return { error: 'invalid_token' as const };
    if (row.usedAt || row.expiresAt <= now) return { error: 'token_expired' as const };
    await tx.update(authTokens).set({ usedAt: now }).where(eq(authTokens.id, row.id));
    return { userId: row.userId };
  });
  if ('error' in result) throw badRequest(result.error);
  return result.userId;
}

export async function sendVerificationEmail(c: C, deps: Deps, user: UserRow): Promise<boolean> {
  if (!user.email || user.emailVerifiedAt) return false;
  const token = await issueAuthToken(deps.db, user.id, 'email_verify', deps.now());
  const link = `${deps.config.publicUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
  try {
    await deps.mailer.send(verifyEmailMessage(user.email, user.name, link, pickLocale(c.req.header('accept-language'))));
    return true;
  } catch (e) {
    console.error('[mail] échec de l’envoi de la vérification :', (e as Error).message);
    return false;
  }
}

export async function sendPasswordReset(c: C, deps: Deps, user: UserRow): Promise<void> {
  if (!user.email) return;
  const token = await issueAuthToken(deps.db, user.id, 'password_reset', deps.now());
  const link = `${deps.config.publicUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await deps.mailer.send(resetPasswordMessage(user.email, user.name, link, pickLocale(c.req.header('accept-language'))));
  } catch (e) {
    console.error('[mail] échec de l’envoi de la réinitialisation :', (e as Error).message);
  }
}

// — Codes à usage unique (OTP) —

const codeHash = (deps: Deps, phone: string, code: string) => hmac(deps.config.secret, `otp:${phone}:${code}`);

export interface OtpIssued {
  channel: OtpChannel;
  expiresInSec: number;
  resendInSec: number;
  devCode?: string;
}

export async function issueOtp(c: C, deps: Deps, phone: string, channel: OtpChannel): Promise<OtpIssued> {
  const now = deps.now();
  const dial = deps.config.otp.allowedDialCodes.find((d) => phone.startsWith(`+${d}`));
  if (!dial) throw badRequest('country_not_supported', { phone: 'country' });
  if (deps.config.otp.provider === 'none') throw new HttpError(503, 'otp_unavailable');

  const ip = c.get('ip');
  await enforce(deps.db, keyFor('otp-ip', ip), 20, 3600, now, 'too_many_requests');
  const resend = await hit(deps.db, keyFor('otp-resend', phone), 1, OTP_RESEND_SEC, now);
  if (!resend.allowed) throw tooMany('resend_too_soon', resend.retryAfterSec);
  const hourly = await hit(deps.db, keyFor('otp-hour', phone), OTP_MAX_PER_HOUR, 3600, now);
  if (!hourly.allowed) throw tooMany('too_many_requests', hourly.retryAfterSec);

  const code = randomCode();
  const id = newId('otp');
  await deps.db.transaction(async (tx) => {
    await tx.update(otpCodes).set({ consumedAt: now }).where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt)));
    await tx.insert(otpCodes).values({ id, phone, codeHash: codeHash(deps, phone, code), channel, expiresAt: new Date(now.getTime() + OTP_TTL_SEC * 1000), ip, createdAt: now });
  });
  try {
    await deps.otp.send({ phone, channel, code, ttlMinutes: OTP_TTL_SEC / 60, locale: pickLocale(c.req.header('accept-language')) });
  } catch (e) {
    await deps.db.delete(otpCodes).where(eq(otpCodes.id, id));
    console.error('[otp] échec de l’envoi :', (e as Error).message);
    throw new HttpError(503, 'otp_unavailable');
  }
  const issued: OtpIssued = { channel, expiresInSec: OTP_TTL_SEC, resendInSec: OTP_RESEND_SEC };
  if (deps.otp.provider === 'dev') issued.devCode = code;
  return issued;
}

/** Vérifie un code. Le compteur d'essais est écrit AVANT de répondre (une réponse ne peut pas annuler un essai). */
export async function checkOtp(c: C, deps: Deps, phone: string, code: string): Promise<void> {
  const now = deps.now();
  await enforce(deps.db, keyFor('otp-verify-ip', c.get('ip')), 30, 3600, now, 'too_many_attempts');
  const outcome = await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, now)))
      .orderBy(desc(otpCodes.createdAt))
      .for('update')
      .limit(1);
    if (!row) return { ok: false as const, reason: 'expired' as const, left: 0 };
    if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false as const, reason: 'too_many_attempts' as const, left: 0 };
    if (safeEqual(row.codeHash, codeHash(deps, phone, code))) {
      await tx.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, row.id));
      return { ok: true as const };
    }
    const attempts = row.attempts + 1;
    await tx.update(otpCodes).set({ attempts, consumedAt: attempts >= OTP_MAX_ATTEMPTS ? now : null }).where(eq(otpCodes.id, row.id));
    return attempts >= OTP_MAX_ATTEMPTS
      ? { ok: false as const, reason: 'too_many_attempts' as const, left: 0 }
      : { ok: false as const, reason: 'invalid_code' as const, left: OTP_MAX_ATTEMPTS - attempts };
  });
  if (outcome.ok) return;
  if (outcome.reason === 'too_many_attempts') throw new HttpError(429, 'too_many_attempts', { attemptsLeft: '0' });
  throw new HttpError(422, outcome.reason, { attemptsLeft: String(outcome.left) });
}

export const verifiedMark = (db: Executor, userId: string, patch: Partial<{ emailVerifiedAt: Date; phoneVerifiedAt: Date }>) =>
  db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, userId));

