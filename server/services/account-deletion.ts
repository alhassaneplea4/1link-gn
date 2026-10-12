/**
 * Suppression d'un compte à la demande de son titulaire (droit à l'effacement ; exigée aussi par les boutiques d'applications).
 * Tout ce qui appartient à la personne part avec elle : page, images, sessions, jetons, abonnement, vérifications, codes.
 * Les journaux de sécurité qui citent son e-mail/téléphone sont purgés ; les journaux d'audit ne gardent qu'un identifiant opaque.
 */
import { and, eq, or } from 'drizzle-orm';
import type { Deps } from '../context.js';
import { otpCodes, payments, securityEvents, users, type users as usersTable } from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { conflict } from '../lib/errors.js';

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
