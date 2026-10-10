import { ApiError } from '@/models/api';
import type { Session, SessionUser, SignUpInput } from '@/models/auth';
import { isEmail } from '@/utilities/validation';
import { uid } from '@/utilities/misc';
import type { AuthApi } from '../types';
import { DEMO_ENTITLEMENTS, DEMO_ROLE_PERMISSIONS } from './permissions';
import { delay, PERSONAS, readDb, writeDb, type DemoUserRecord } from './db';

const SESSION_MS = 8 * 3_600_000;

export function toSession(u: DemoUserRecord, expiresAt: string): Session {
  const user: SessionUser = {
    id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerified, category: u.category,
    onboardingDone: u.onboardingDone, username: u.username, plan: u.plan, adminRole: u.adminRole,
  };
  return {
    user,
    permissions: u.adminRole ? DEMO_ROLE_PERMISSIONS[u.adminRole] : [],
    entitlements: DEMO_ENTITLEMENTS[u.plan],
    expiresAt,
    demo: true,
  };
}

function currentUser(): DemoUserRecord | null {
  const db = readDb();
  if (!db.sessionUserId || !db.sessionExpiresAt) return null;
  if (new Date(db.sessionExpiresAt).getTime() < Date.now()) return null;
  return db.users.find((u) => u.id === db.sessionUserId) ?? null;
}

export const demoAuth: AuthApi = {
  demoAccounts: /* @__PURE__ */ PERSONAS.map((p) => ({ id: p.id, label: p.label, email: p.email, description: p.description })),

  async getSession() {
    const u = currentUser();
    return delay(u ? toSession(u, readDb().sessionExpiresAt!) : null, 120);
  },

  async signIn(email, password) {
    await delay(null);
    if (!isEmail(email) || password.length < 1) throw new ApiError('validation', 'invalid');
    const user = readDb().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    // Démonstration : aucun mot de passe n'est vérifié. Un e-mail inconnu est refusé pour montrer l'état d'erreur.
    if (!user) throw new ApiError('unauthorized', 'invalid_credentials', { status: 401 });
    if (readDb().userStatus[user.id] === 'suspended') throw new ApiError('forbidden', 'account_suspended', { status: 403 });
    const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
    writeDb((db) => {
      db.sessionUserId = user.id;
      db.sessionExpiresAt = expiresAt;
    });
    return toSession(user, expiresAt);
  },

  async signUp(input: SignUpInput) {
    await delay(null);
    if (!isEmail(input.email) || input.password.length < 8 || !input.name.trim() || !input.acceptTerms) throw new ApiError('validation', 'invalid');
    const db = readDb();
    if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      throw new ApiError('conflict', 'email_taken', { status: 409, fields: { email: 'taken' } });
    }
    const record: DemoUserRecord = {
      id: uid('u'), email: input.email.trim().toLowerCase(), name: input.name.trim(), emailVerified: false,
      category: null, onboardingDone: false, username: null, plan: 'free', adminRole: null, createdAt: new Date().toISOString(),
    };
    const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
    writeDb((d) => {
      d.users.push(record);
      d.sessionUserId = record.id;
      d.sessionExpiresAt = expiresAt;
    });
    return toSession(record, expiresAt);
  },

  async signOut() {
    await delay(null, 80);
    writeDb((db) => {
      db.sessionUserId = null;
      db.sessionExpiresAt = null;
    });
  },

  async requestPasswordReset(email) {
    await delay(null);
    if (!isEmail(email)) throw new ApiError('validation', 'invalid');
    // Réponse volontairement identique que le compte existe ou non (pas d'énumération de comptes).
  },

  async resetPassword(token, password) {
    await delay(null);
    if (!token) throw new ApiError('validation', 'invalid_token');
    if (password.length < 8) throw new ApiError('validation', 'weak_password');
  },

  async verifyEmail(token) {
    await delay(null);
    if (token === 'expired') throw new ApiError('validation', 'token_expired');
    return demoAuth.demoVerifyCurrentUser!();
  },

  async resendVerification() {
    await delay(null);
  },

  async demoVerifyCurrentUser() {
    const u = currentUser();
    if (!u) throw new ApiError('unauthorized', 'no_session', { status: 401 });
    writeDb((db) => {
      const rec = db.users.find((x) => x.id === u.id);
      if (rec) rec.emailVerified = true;
    });
    return toSession({ ...u, emailVerified: true }, readDb().sessionExpiresAt!);
  },
};

/** Interne aux adaptateurs de démonstration. */
export function requireDemoUser(): DemoUserRecord {
  const u = currentUser();
  if (!u) throw new ApiError('unauthorized', 'no_session', { status: 401 });
  return u;
}
