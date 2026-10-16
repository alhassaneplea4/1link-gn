/**
 * Contrat de la couche d'accès aux données.
 * Les composants ne dépendent QUE de ces interfaces ; l'unique implémentation (services/api/http) parle à l'API du serveur
 * (dossier `server/`), qui lit et écrit dans PostgreSQL. Aucune donnée n'est conservée ni inventée côté navigateur.
 */
import type { Paged, ListQuery } from '@/models/api';
import type { VerificationDecision, VerificationInput, VerificationRequest, VerificationState } from '@/models/verification';
import type { CodeSent, DeletionTarget, IdentityProof, MfaMethod, MfaStatus, OtpChannel, OtpRequestResult, OtpVerifyInput, Session, SignInResult, SignUpInput, TotpSetup } from '@/models/auth';
import type { PageDocument, PublicPageResult } from '@/models/page';
import type { AnalyticsReport, DateRange } from '@/models/analytics';
import type { ChangePlanResult, Invoice, Subscription } from '@/models/billing';
import type { AdminRole, Permission, PlanId } from '@/models/auth';
import type {
  AdminProfileRow, AdminUserDetail, AdminUserRow, AuditLog, ModerationDecision, MutationOutcome, ReportReason, PaymentRow,
  PlatformOverview, RealtimeEvent, RealtimeState, Report, SecurityEvent, ServiceStatus, SubscriptionRow, Ticket,
} from '@/models/admin';

/** Ce que le serveur sait réellement faire (selon les fournisseurs configurés). */
export interface Capabilities {
  otpChannels: OtpChannel[];
  emailSending: boolean;
}

export interface AuthApi {
  getCapabilities(): Promise<Capabilities>;
  /** `null` quand personne n'est connecté. */
  getSession(): Promise<Session | null>;
  /** Ouvre une session, ou — si la double authentification SMS est active — demande d'abord le code reçu par SMS. */
  signIn(email: string, password: string): Promise<SignInResult>;
  /** 2e étape de la connexion : valide le code (SMS, e-mail, application ou secours) avec le jeton de l'étape 1. */
  completeTwoFactor(challenge: string, code: string, method?: MfaMethod | 'recovery'): Promise<Session>;
  /** Renvoie le code d'une méthode (SMS ou e-mail) du défi en cours. */
  sendTwoFactorCode(challenge: string, method: 'sms' | 'email'): Promise<CodeSent>;
  /** Inscription ET connexion sans mot de passe : envoie un code à l'adresse. */
  requestEmailCode(email: string): Promise<CodeSent>;
  /** Vérifie le code : ouvre le compte existant ou le crée (conditions acceptées). */
  verifyEmailCode(input: { email: string; code: string }): Promise<SignInResult>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;
  /** Envoie un code à usage unique (WhatsApp ou SMS). Le numéro est au format E.164. */
  requestOtp(input: { phone: string; channel: OtpChannel }): Promise<OtpRequestResult>;
  /** Vérifie le code ; ouvre une session (connexion) ou crée le compte (inscription). */
  verifyOtp(input: OtpVerifyInput): Promise<Session>;
  requestPasswordReset(email: string): Promise<void>;
  /** Réinitialisation par SMS : réponse identique que le numéro ait un compte ou non. */
  requestPhoneReset(phone: string): Promise<OtpRequestResult>;
  resetPasswordByPhone(input: { phone: string; code: string; password: string }): Promise<void>;
  /** Associe un numéro au compte connecté : envoi du code, puis vérification (preuve de possession). */
  requestPhoneLink(input: { phone: string; channel: OtpChannel }): Promise<OtpRequestResult>;
  verifyPhoneLink(input: { phone: string; code: string }): Promise<Session>;
  removePhone(proof: IdentityProof): Promise<Session>;
  /** Envoie le code de confirmation d'identité (e-mail du compte, sinon SMS) quand le compte n'a pas de mot de passe. */
  requestIdentityCode(): Promise<CodeSent & { via: 'email' | 'sms' }>;
  /** Demande la suppression : sessions fermées, confirmation finale possible après 15 jours sans activité. */
  requestAccountDeletion(proof: IdentityProof): Promise<void>;
  getDeletionTarget(token: string): Promise<DeletionTarget>;
  requestDeletionCode(token: string): Promise<CodeSent>;
  /** Confirmation finale (lien reçu par e-mail) : supprime définitivement le compte et ses données. */
  confirmAccountDeletion(input: { token: string } & IdentityProof): Promise<void>;
  getMfa(): Promise<MfaStatus>;
  setSmsMfa(enabled: boolean, proof: IdentityProof): Promise<Session>;
  setEmailMfa(enabled: boolean, proof: IdentityProof): Promise<Session>;
  setupTotp(proof: IdentityProof): Promise<TotpSetup>;
  enableTotp(code: string): Promise<{ recoveryCodes: string[]; session: Session }>;
  disableTotp(proof: IdentityProof): Promise<Session>;
  regenerateRecoveryCodes(proof: IdentityProof): Promise<string[]>;
  /** Définit (compte créé par code) ou change le mot de passe. */
  setPassword(newPassword: string, proof: IdentityProof): Promise<Session>;
  resetPassword(token: string, password: string): Promise<void>;
  /** Valide l'e-mail avec le jeton du lien. Retourne la session mise à jour si le lien est ouvert dans la session du même compte, sinon `null`. */
  verifyEmail(token: string): Promise<Session | null>;
  resendVerification(): Promise<void>;
}

export interface ReportInput {
  reason: ReportReason;
  details: string;
}

export interface PageApi {
  getMyPage(): Promise<PageDocument | null>;
  saveDraft(doc: PageDocument): Promise<PageDocument>;
  publish(doc: PageDocument): Promise<PageDocument>;
  unpublish(): Promise<PageDocument>;
  getPublicPage(username: string): Promise<PublicPageResult>;
  checkUsername(username: string): Promise<{ available: boolean; reason?: 'taken' | 'reserved' | 'invalid' }>;
  /** Change l'adresse 1Link de la page (l'ancienne adresse cesse de fonctionner). */
  changeUsername(username: string): Promise<PageDocument>;
  getVerification(): Promise<VerificationState>;
  requestVerification(input: VerificationInput): Promise<VerificationState>;
  /** Signalement d'une page publique par un visiteur (anonyme). */
  reportPage(username: string, input: ReportInput): Promise<void>;
  /** `source` = canal d'origine (paramètre `?src=` sanitisé), pour l'attribution des visites. */
  trackEvent(username: string, event: { type: 'view'; source?: string } | { type: 'click'; blockId: string; source?: string }): Promise<void>;
  /** Brouillon de l'assistant de configuration, conservé côté serveur (reprise sur n'importe quel appareil). */
  getOnboardingState(): Promise<Record<string, unknown> | null>;
  saveOnboardingState(state: Record<string, unknown> | null): Promise<void>;
}

export interface AnalyticsApi {
  getReport(range: DateRange): Promise<AnalyticsReport>;
}

export interface BillingApi {
  getSubscription(): Promise<Subscription>;
  listInvoices(): Promise<Invoice[]>;
  changePlan(planId: PlanId, period: 'monthly' | 'yearly'): Promise<ChangePlanResult>;
  cancel(): Promise<Subscription>;
  resume(): Promise<Subscription>;
}

export interface AdminApi {
  getOverview(range: DateRange): Promise<PlatformOverview>;
  listUsers(q: ListQuery): Promise<Paged<AdminUserRow>>;
  getUser(id: string): Promise<AdminUserDetail>;
  listProfiles(q: ListQuery): Promise<Paged<AdminProfileRow>>;
  listReports(q: ListQuery): Promise<Paged<Report>>;
  getReport(id: string): Promise<Report>;
  applyDecision(reportId: string, decision: ModerationDecision, note: string): Promise<MutationOutcome>;
  setUserStatus(userId: string, status: 'active' | 'suspended'): Promise<MutationOutcome>;
  /** Accorde ou retire le badge « Vérifié ». */
  setVerifiedBadge(userId: string, verified: boolean): Promise<MutationOutcome>;
  /** Active l'abonnement d'un compte après réception du paiement (Mobile Money, carte, virement) ; l'abonnement compte à partir de la fin de l'essai. */
  activateSubscription(userId: string, input: { planId: 'basic' | 'pro' | 'business'; period: 'monthly' | 'yearly'; method: 'mobile_money' | 'card' | 'bank'; reference: string }): Promise<Subscription>;
  listVerifications(q: ListQuery): Promise<Paged<VerificationRequest>>;
  decideVerification(id: string, decision: VerificationDecision, note: string): Promise<MutationOutcome>;
  listSubscriptions(q: ListQuery): Promise<Paged<SubscriptionRow>>;
  listPayments(q: ListQuery): Promise<Paged<PaymentRow>>;
  listTickets(q: ListQuery): Promise<Paged<Ticket>>;
  listAuditLogs(q: ListQuery): Promise<Paged<AuditLog>>;
  listSecurityEvents(q: ListQuery): Promise<Paged<SecurityEvent>>;
  getSystemStatus(): Promise<ServiceStatus[]>;
  /** Référence rôle → permissions (lecture seule, fournie par le serveur). */
  getRoleMatrix(): Promise<Record<AdminRole, Permission[]>>;
}

/** Flux temps réel de l'Admin Center (SSE). */
export interface RealtimeAdapter {
  readonly kind: 'sse' | 'none';
  /** Vrai si une source de données est configurée. */
  readonly available: boolean;
  connect(handlers: { onEvent(e: RealtimeEvent): void; onState(s: RealtimeState): void; onActiveVisitors?(n: number): void }): () => void;
}

export interface Api {
  auth: AuthApi;
  page: PageApi;
  analytics: AnalyticsApi;
  billing: BillingApi;
  admin: AdminApi;
  realtime: RealtimeAdapter;
}
