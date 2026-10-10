/**
 * Contrat de la couche d'accès aux données.
 * Les composants ne dépendent QUE de ces interfaces ; l'unique implémentation (services/api/http) parle à l'API du serveur
 * (dossier `server/`), qui lit et écrit dans PostgreSQL. Aucune donnée n'est conservée ni inventée côté navigateur.
 */
import type { Paged, ListQuery } from '@/models/api';
import type { VerificationDecision, VerificationInput, VerificationRequest, VerificationState } from '@/models/verification';
import type { OtpChannel, OtpRequestResult, OtpVerifyInput, Session, SignUpInput } from '@/models/auth';
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
  signIn(email: string, password: string): Promise<Session>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;
  /** Envoie un code à usage unique (WhatsApp ou SMS). Le numéro est au format E.164. */
  requestOtp(input: { phone: string; channel: OtpChannel }): Promise<OtpRequestResult>;
  /** Vérifie le code ; ouvre une session (connexion) ou crée le compte (inscription). */
  verifyOtp(input: OtpVerifyInput): Promise<Session>;
  requestPasswordReset(email: string): Promise<void>;
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
