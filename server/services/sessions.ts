import { and, eq, gt, lt, ne } from 'drizzle-orm';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AuthContext, C, Deps, UserRow } from '../context.js';
import { pages, sessions, subscriptions, users } from '../db/schema.js';
import { sha256, newToken } from '../lib/crypto.js';
import { entitlementsFor, permissionsFor } from '../lib/access.js';
import type { AdminRole, PlanId, Session } from '../../src/models/auth.js';
import { badgesFor } from '../../src/models/badges.js';
import type { CategoryId } from '../../src/models/category.js';

const COOKIE = 'onelink_session';
/** Au-delà de ce délai sans écriture, on actualise `last_seen_at` (évite une écriture par requête). */
const TOUCH_EVERY_MS = 5 * 60_000;

const ttlMs = (deps: Deps, user: Pick<UserRow, 'adminRole'>) =>
  user.adminRole ? deps.config.adminSessionHours * 3_600_000 : deps.config.sessionDays * 86_400_000;

function cookieOptions(deps: Deps, expires: Date) {
  // `__Host-` : le navigateur refuse tout cookie sans Secure, avec Domain ou hors de la racine.
  return { httpOnly: true, secure: deps.config.cookieSecure, sameSite: 'Lax' as const, path: '/', expires, ...(deps.config.cookieSecure ? { prefix: 'host' as const } : {}) };
}

export async function startSession(c: C, deps: Deps, user: UserRow): Promise<Date> {
  const token = newToken();
  const now = deps.now();
  const expiresAt = new Date(now.getTime() + ttlMs(deps, user));
  await deps.db.insert(sessions).values({ id: sha256(token), userId: user.id, createdAt: now, expiresAt, lastSeenAt: now, ip: c.get('ip'), userAgent: c.get('ua').slice(0, 250) });
  setCookie(c, COOKIE, token, cookieOptions(deps, expiresAt));
  await deps.db.update(users).set({ lastActiveAt: now }).where(eq(users.id, user.id));
  return expiresAt;
}

export function clearSessionCookie(c: C, deps: Deps) {
  deleteCookie(c, COOKIE, { path: '/', secure: deps.config.cookieSecure, ...(deps.config.cookieSecure ? { prefix: 'host' as const } : {}) });
}

/** Résout le cookie en utilisateur authentifié. Retourne null si absent, inconnu, expiré ou si le compte est suspendu. */
export async function loadSession(c: C, deps: Deps): Promise<AuthContext | null> {
  const token = getCookie(c, COOKIE, deps.config.cookieSecure ? 'host' : undefined);
  if (!token || token.length > 128) return null;
  const id = sha256(token);
  const now = deps.now();
  const [row] = await deps.db
    .select({ s: sessions, u: users, username: pages.username, planId: subscriptions.planId, subStatus: subscriptions.status })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(pages, eq(pages.userId, users.id))
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  if (row.u.status !== 'active') {
    await deps.db.delete(sessions).where(eq(sessions.userId, row.u.id));
    return null;
  }
  let expiresAt = row.s.expiresAt;
  if (now.getTime() - row.s.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    // Expiration glissante pour les utilisateurs ; les sessions admin gardent leur échéance absolue.
    if (!row.u.adminRole) expiresAt = new Date(now.getTime() + ttlMs(deps, row.u));
    await deps.db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id));
    await deps.db.update(users).set({ lastActiveAt: now }).where(eq(users.id, row.u.id));
    if (!row.u.adminRole) setCookie(c, COOKIE, token, cookieOptions(deps, expiresAt));
  }
  const paid = row.subStatus === 'active' || row.subStatus === 'trialing' || row.subStatus === 'past_due';
  return { user: row.u, sessionId: id, username: row.username, planId: (paid ? row.planId : 'free') as PlanId, expiresAt };
}

export async function endSession(deps: Deps, sessionId: string) {
  await deps.db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Révoque toutes les sessions d'un utilisateur (changement de mot de passe, suspension), sauf éventuellement la courante. */
export async function endUserSessions(deps: Deps, userId: string, exceptId?: string) {
  await deps.db.delete(sessions).where(exceptId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptId)) : eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(deps: Deps) {
  await deps.db.delete(sessions).where(lt(sessions.expiresAt, deps.now()));
}

/** Représentation publique de la session (ce que voit l'interface). */
export function toSession(a: Pick<AuthContext, 'user' | 'username' | 'planId'>, expiresAt: Date): Session {
  const u = a.user;
  return {
    user: {
      id: u.id, email: u.email, phone: u.phone, name: u.name, emailVerified: u.emailVerifiedAt !== null, phoneVerified: u.phoneVerifiedAt !== null, twoFactorSms: u.twoFactorSms,
      category: u.category as CategoryId | null, onboardingDone: u.onboardingDone, username: a.username, plan: a.planId, adminRole: u.adminRole as AdminRole | null,
      badges: badgesFor({ adminRole: u.adminRole, verified: u.verified, plan: a.planId }),
    },
    permissions: permissionsFor(u.adminRole as AdminRole | null),
    entitlements: entitlementsFor(a.planId),
    expiresAt: expiresAt.toISOString(),
  };
}
