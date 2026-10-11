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
  /** Peut être absent : un compte créé par téléphone n'a pas forcément d'e-mail. */
  email: string | null;
  phone: string | null;
  name: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Un code SMS est demandé à chaque connexion par mot de passe. */
  twoFactorSms: boolean;
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
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  acceptTerms: boolean;
}

/** Un contact vérifié (e-mail OU téléphone) suffit pour publier. */
export const isContactVerified = (u: Pick<SessionUser, 'emailVerified' | 'phoneVerified'>) => u.emailVerified || u.phoneVerified;

/** Identifiant affichable du compte. */
export const accountContact = (u: Pick<SessionUser, 'email' | 'phone'>) => u.email ?? u.phone ?? '';

export type OtpChannel = 'whatsapp' | 'sms';

/** Étape intermédiaire de connexion : le mot de passe est correct, un code SMS reste à saisir. */
export interface TwoFactorChallenge {
  /** Jeton signé, valable 10 min : lie la saisie du code au mot de passe qui vient d'être validé. */
  challenge: string;
  /** Numéro masqué (affichage). */
  phoneMasked: string;
  channel: OtpChannel;
  expiresInSec: number;
  resendInSec: number;
  /** UNIQUEMENT en développement local (fournisseur de test). */
  devCode?: string;
}

export type SignInResult = { kind: 'session'; session: Session } | { kind: 'two_factor'; challenge: TwoFactorChallenge };

export interface OtpRequestResult {
  channel: OtpChannel;
  expiresInSec: number;
  resendInSec: number;
  /** UNIQUEMENT en développement local (fournisseur de test, jamais en production) : le code est révélé car aucun message n'est envoyé. */
  devCode?: string;
}

export interface OtpVerifyInput {
  /** Numéro au format E.164. */
  phone: string;
  code: string;
  /** `sign_up` crée le compte (nom et conditions requis) ; `sign_in` ouvre un compte existant. */
  mode: 'sign_in' | 'sign_up';
  name?: string;
  acceptTerms?: boolean;
}
