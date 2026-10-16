import type { AccessInfo, PlanId } from './access';
import type { CategoryId } from './category';

export type { PlanId };

export const ADMIN_ROLES = ['super_admin', 'admin', 'moderator', 'support', 'analyst', 'finance'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_SECTIONS = [
  'overview', 'realtime', 'users', 'profiles', 'analytics', 'subscriptions', 'payments',
  'moderation', 'reports', 'support', 'security', 'logs', 'system', 'settings',
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/** Permission = `<section>:<action>`. Communiquées par le backend ; l'UI ne fait que les refléter. */
export type Permission = `${AdminSection}:${'read' | 'write'}`;

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
  /** Un code SMS est demandé à chaque connexion (vérification en deux étapes par SMS). */
  twoFactorSms: boolean;
  /** Méthodes de vérification en deux étapes activées (toutes désactivées par défaut). */
  mfa: { sms: boolean; email: boolean; totp: boolean };
  /** Le compte a un mot de passe (un compte créé par e-mail n'en a pas tant qu'on n'en définit pas). */
  hasPassword: boolean;
  /** Suppression de compte demandée le (délai de 15 jours sans activité avant la confirmation finale). */
  deletionRequestedAt: string | null;
  category: CategoryId | null;
  onboardingDone: boolean;
  username: string | null;
  plan: PlanId;
  adminRole: AdminRole | null;
  /** Badges de profil mérités, du plus élevé au plus bas (calculés par le serveur). */
  badges: ('official' | 'team' | 'verified' | 'business' | 'pro')[];
}

export interface Session {
  user: SessionUser;
  permissions: Permission[];
  entitlements: Entitlements;
  /** Phase d'accès (essai gratuit, essai d'abonnement, abonné, expiré) et offre effective : les droits détaillés viennent de `RIGHTS[access.plan]`. */
  access: AccessInfo;
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

export type MfaMethod = 'sms' | 'email' | 'totp';

/** Étape intermédiaire de connexion : la première étape est validée, une seconde vérification reste à saisir. */
export interface TwoFactorChallenge {
  /** Jeton signé, valable 10 min : lie la saisie du code à la première étape qui vient d'être validée. */
  challenge: string;
  /** Méthodes que le compte a activées (et qui ne répètent pas la première étape). */
  methods: MfaMethod[];
  /** Méthode proposée en premier (son code a déjà été envoyé pour SMS et e-mail). */
  method: MfaMethod;
  /** Numéro masqué (affichage), si la méthode SMS est proposée. */
  phoneMasked?: string;
  /** Adresse masquée (affichage), si la méthode e-mail est proposée. */
  emailMasked?: string;
  channel?: OtpChannel;
  expiresInSec: number;
  resendInSec: number;
  /** UNIQUEMENT en développement local (fournisseur de test). */
  devCode?: string;
}

/** Preuve d'identité exigée avant une opération sensible : mot de passe, ou code reçu par e-mail / SMS (compte sans mot de passe). */
export interface IdentityProof { password?: string; code?: string }

export interface CodeSent { expiresInSec: number; resendInSec: number; devCode?: string }

/** État des méthodes de vérification en deux étapes (Sécurité). */
export interface MfaStatus {
  sms: { enabled: boolean; phoneVerified: boolean };
  email: { enabled: boolean; available: boolean };
  totp: { enabled: boolean };
  recoveryLeft: number;
  hasPassword: boolean;
}

export interface TotpSetup { secret: string; uri: string }

/** Compte visé par un lien de confirmation de suppression. */
export interface DeletionTarget { name: string; hasPassword: boolean; contact: string }

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
