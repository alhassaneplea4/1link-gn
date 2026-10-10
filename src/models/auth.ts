import type { CategoryId } from './category';

export const ADMIN_ROLES = ['super_admin', 'admin', 'moderator', 'support', 'analyst', 'finance'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_SECTIONS = [
  'overview', 'realtime', 'users', 'profiles', 'analytics', 'subscriptions', 'payments',
  'moderation', 'reports', 'support', 'security', 'logs', 'system', 'settings',
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/** Permission = `<section>:<action>`. Communiquées par le backend ; l'UI ne fait que les refléter. */
export type Permission = `${AdminSection}:${'read' | 'write'}`;

export type PlanId = 'free' | 'pro' | 'business';

export interface Entitlements {
  maxBlocks: number;
  removeBranding: boolean;
  analyticsDays: number;
  teamSeats: number;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  category: CategoryId | null;
  onboardingDone: boolean;
  username: string | null;
  plan: PlanId;
  adminRole: AdminRole | null;
}

export interface Session {
  user: SessionUser;
  permissions: Permission[];
  entitlements: Entitlements;
  expiresAt: string;
  /** Vrai quand la session provient d'un adaptateur de démonstration. */
  demo: boolean;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  acceptTerms: boolean;
}
