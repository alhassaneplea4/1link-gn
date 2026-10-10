import { ADMIN_SECTIONS, type AdminRole, type Entitlements, type Permission, type PlanId } from '@/models/auth';

const all = (action: 'read' | 'write'): Permission[] => ADMIN_SECTIONS.map((s) => `${s}:${action}` as Permission);
const perms = (read: readonly string[], write: readonly string[] = []): Permission[] => [
  ...read.map((s) => `${s}:read` as Permission),
  ...write.map((s) => `${s}:write` as Permission),
];

/** Matrice DE DÉMONSTRATION. En production, les permissions sont calculées et envoyées par le backend. */
export const DEMO_ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [...all('read'), ...all('write')],
  admin: [...all('read'), ...perms([], ['users', 'profiles', 'moderation', 'reports', 'support', 'subscriptions', 'settings'])],
  moderator: perms(['overview', 'users', 'profiles', 'moderation', 'reports', 'logs'], ['moderation', 'reports']),
  support: perms(['overview', 'users', 'profiles', 'support', 'subscriptions', 'reports'], ['support']),
  analyst: perms(['overview', 'realtime', 'analytics', 'profiles', 'subscriptions']),
  finance: perms(['overview', 'analytics', 'subscriptions', 'payments', 'logs'], ['payments', 'subscriptions']),
};

export const DEMO_ENTITLEMENTS: Record<PlanId, Entitlements> = {
  free: { maxBlocks: 10, removeBranding: false, analyticsDays: 7, teamSeats: 1 },
  pro: { maxBlocks: 50, removeBranding: true, analyticsDays: 90, teamSeats: 1 },
  business: { maxBlocks: 500, removeBranding: true, analyticsDays: 365, teamSeats: 5 },
};
