/**
 * Droits : matrice rôle → permissions et droits des offres. Cette matrice est l'AUTORITÉ : l'interface ne fait
 * que refléter ce que le serveur renvoie dans la session, et chaque route admin la revérifie.
 */
import { ADMIN_SECTIONS, type AdminRole, type Entitlements, type Permission, type PlanId } from '../../src/models/auth.js';
import { RIGHTS } from '../../src/models/access.js';

const all = (action: 'read' | 'write'): Permission[] => ADMIN_SECTIONS.map((s) => `${s}:${action}` as Permission);
const perms = (read: readonly string[], write: readonly string[] = []): Permission[] => [
  ...read.map((s) => `${s}:read` as Permission),
  ...write.map((s) => `${s}:write` as Permission),
];

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [...all('read'), ...all('write')],
  admin: [...all('read'), ...perms([], ['users', 'profiles', 'moderation', 'reports', 'support', 'subscriptions', 'settings'])],
  moderator: perms(['overview', 'users', 'profiles', 'moderation', 'reports', 'logs'], ['moderation', 'reports']),
  support: perms(['overview', 'users', 'profiles', 'support', 'subscriptions', 'reports'], ['support']),
  analyst: perms(['overview', 'realtime', 'analytics', 'profiles', 'subscriptions']),
  finance: perms(['overview', 'analytics', 'subscriptions', 'payments', 'logs'], ['payments', 'subscriptions']),
};

export const permissionsFor = (role: AdminRole | null): Permission[] => (role ? ROLE_PERMISSIONS[role] : []);

/** Plafond dur pour l'offre « illimitée » : protège la base et le rendu contre un document démesuré. */
export const HARD_MAX_BLOCKS = 500;

/** Résumé des droits d'une offre (le détail — blocs, thèmes, onglets, statistiques — est dans `RIGHTS`). */
export function entitlementsFor(planId: PlanId): Entitlements {
  const r = RIGHTS[planId];
  return { maxBlocks: r.maxBlocks, removeBranding: r.removeBranding, analyticsDays: r.analytics?.maxDays ?? 0, teamSeats: r.teamSeats };
}
