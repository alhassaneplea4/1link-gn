/**
 * Suppression d'un compte à la demande de son titulaire (droit à l'effacement ; exigée aussi par les boutiques d'applications).
 * Tout ce qui appartient à la personne part avec elle : page, images, sessions, jetons, abonnement, vérifications, codes.
 * Les journaux de sécurité qui citent son e-mail/téléphone sont purgés ; les journaux d'audit ne gardent qu'un identifiant opaque.
 */
import { and, eq, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { C, Deps } from '../context.js';
import { authTokens, otpCodes, payments, securityEvents, users, type users as usersTable } from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { sha256 } from '../lib/crypto.js';
import { badRequest, conflict } from '../lib/errors.js';
import { deletionConfirmMessage } from '../lib/emails.js';
import { issueAuthToken } from './accounts.js';
import { confirmIdentity, type Identity } from './identity.js';
import { asLocale, notify } from './notifications.js';
import { securityNoticeMessage } from '../lib/emails.js';
import { endUserSessions } from './sessions.js';

/** Délai sans aucune activité avant de pouvoir confirmer la suppression, puis durée de validité du lien de confirmation. */
export const DELETION_WAIT_DAYS = 15;
export const DELETION_CONFIRM_DAYS = 7;
const DAY = 86_400_000;

type UserRow = typeof usersTable.$inferSelect;

export async function deleteAccount(deps: Deps, user: UserRow, ip: string | null): Promise<void> {
  // Un administrateur ne se supprime pas lui-même (on évite de laisser la plateforme sans administrateur) : son rôle est retiré d'abord.
  if (user.adminRole) throw conflict('admin_account');
  // Les pièces de paiement doivent être conservées (obligation comptable) : leur titulaire passe par le support.
  const [pay] = await deps.db.select({ id: payments.id }).from(payments).where(eq(payments.userId, user.id)).limit(1);
  if (pay) throw conflict('payments_exist');

  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const subjects = [user.email, user.phone].filter((s): s is string => Boolean(s));
    if (subjects.length) {
      await tx.delete(securityEvents).where(or(...subjects.map((s) => eq(securityEvents.subject, s))));
      if (user.phone) await tx.delete(otpCodes).where(eq(otpCodes.phone, user.phone));
    }
    await tx.delete(securityEvents).where(and(eq(securityEvents.userId, user.id)));
    await tx.delete(users).where(eq(users.id, user.id)); // cascade : pages, médias, sessions, jetons, abonnement, vérifications…
    await audit(tx, { actorId: null, actorLabel: 'Titulaire du compte', action: 'Compte supprimé à la demande de son titulaire', target: user.id, ip, level: 'warning' }, now);
  });
}

// — Suppression en plusieurs étapes —
//  1. Le titulaire demande la suppression (mot de passe ou code) : toutes ses sessions sont fermées ;
//  2. s'il ne se reconnecte pas pendant 15 jours (une connexion annule la demande), un lien de confirmation lui est envoyé ;
//  3. ce lien, valable 7 jours, exige son mot de passe (ou un code pour un compte sans mot de passe) : le compte est alors supprimé définitivement.

export async function requestDeletion(c: C, deps: Deps, user: UserRow, proof: Identity): Promise<void> {
  if (user.adminRole) throw conflict('admin_account');
  await confirmIdentity(c, deps, user, proof);
  const now = deps.now();
  await deps.db.update(users).set({ deletionRequestedAt: now, deletionNotifiedAt: null, updatedAt: now }).where(eq(users.id, user.id));
  await endUserSessions(deps, user.id);
  await audit(deps.db, { actorId: user.id, actorLabel: 'Titulaire du compte', action: 'Suppression du compte demandée', target: user.id, ip: c.get('ip') }, now);
  notify(deps, user, (to, name, locale) => securityNoticeMessage(to, name, 'deletion_requested', locale));
}

/** Tâche planifiée : envoie les liens de confirmation échus et abandonne les demandes jamais confirmées. */
export async function processDeletionRequests(deps: Deps): Promise<{ notified: number; lapsed: number }> {
  const now = deps.now();
  const due = await deps.db.select().from(users).where(and(isNotNull(users.deletionRequestedAt), isNull(users.deletionNotifiedAt), lte(users.deletionRequestedAt, new Date(now.getTime() - DELETION_WAIT_DAYS * DAY)), eq(users.status, 'active')));
  let notified = 0;
  for (const user of due) {
    if (!user.email) continue;
    const token = await issueAuthToken(deps.db, user.id, 'account_delete', now);
    const link = `${deps.config.publicUrl}/auth/confirm-deletion?token=${encodeURIComponent(token)}`;
    try {
      await deps.mailer.send(deletionConfirmMessage(user.email, user.name, link, asLocale(user.locale)));
      await deps.db.update(users).set({ deletionNotifiedAt: now }).where(eq(users.id, user.id));
      notified++;
    } catch (e) {
      console.error('[deletion] échec de l’envoi du lien :', (e as Error).message);
    }
  }
  const lapsed = await deps.db
    .update(users)
    .set({ deletionRequestedAt: null, deletionNotifiedAt: null })
    .where(and(isNotNull(users.deletionNotifiedAt), lte(users.deletionNotifiedAt, new Date(now.getTime() - DELETION_CONFIRM_DAYS * DAY))))
    .returning({ id: users.id });
  return { notified, lapsed: lapsed.length };
}

/** Compte visé par un lien de confirmation (le jeton n'est consommé qu'à la réussite, pour laisser corriger le mot de passe). */
async function targetOf(deps: Deps, token: string): Promise<UserRow> {
  const [row] = await deps.db
    .select({ tok: authTokens, user: users })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.kind, 'account_delete')))
    .limit(1);
  if (!row) throw badRequest('invalid_token');
  if (row.tok.usedAt || row.tok.expiresAt <= deps.now() || !row.user.deletionRequestedAt) throw badRequest('token_expired');
  return row.user;
}

export async function deletionTarget(deps: Deps, token: string): Promise<{ name: string; hasPassword: boolean; contact: string }> {
  const user = await targetOf(deps, token);
  return { name: user.name, hasPassword: user.passwordHash !== null, contact: user.email ?? user.phone ?? '' };
}

export async function confirmDeletion(c: C, deps: Deps, token: string, proof: Identity): Promise<UserRow> {
  const user = await targetOf(deps, token);
  await confirmIdentity(c, deps, user, proof);
  await deps.db.update(authTokens).set({ usedAt: deps.now() }).where(eq(authTokens.tokenHash, sha256(token)));
  await deleteAccount(deps, user, c.get('ip'));
  return user;
}

