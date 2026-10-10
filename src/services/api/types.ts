/**
 * Contrat de la couche d'accès aux données.
 * Les composants ne dépendent QUE de ces interfaces : brancher la vraie API revient à fournir
 * l'implémentation HTTP (services/api/http) à la place de l'implémentation de démonstration.
 */
import type { Paged, ListQuery } from '@/models/api';
import type { VerificationDecision, VerificationInput, VerificationRequest, VerificationState } from '@/models/verification';
import type { Session, SignUpInput } from '@/models/auth';
import type { PageDocument, PublicPageResult } from '@/models/page';
import type { AnalyticsReport, DateRange } from '@/models/analytics';
import type { ChangePlanResult, Invoice, Subscription } from '@/models/billing';
import type { AdminRole, Permission, PlanId } from '@/models/auth';
import type {
  AdminProfileRow, AdminUserDetail, AdminUserRow, AuditLog, ModerationDecision, MutationOutcome, ReportReason, PaymentRow,
  PlatformOverview, RealtimeEvent, RealtimeState, Report, SecurityEvent, ServiceStatus, SubscriptionRow, Ticket,
} from '@/models/admin';

export interface DemoAccount {
  id: string;
  label: string;
  email: string;
  description: string;
}

export interface AuthApi {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  /** Vérifie l'e-mail à partir du jeton reçu par courriel. */
  verifyEmail(token: string): Promise<Session>;
  resendVerification(): Promise<void>;
  /** Uniquement présent en mode démonstration. */
  demoAccounts?: DemoAccount[];
  /** Uniquement présent en mode démonstration : le courriel n'existant pas, permet de valider le compte. */
  demoVerifyCurrentUser?(): Promise<Session>;
}

export interface PublishResult {
  page: PageDocument;
  /** `demo` : enregistré localement dans ce navigateur uniquement. */
  mode: 'demo' | 'live';
}

export interface ReportInput {
  reason: ReportReason;
  details: string;
}

export interface PageApi {
  getMyPage(): Promise<PageDocument | null>;
  saveDraft(doc: PageDocument): Promise<PageDocument>;
  publish(doc: PageDocument): Promise<PublishResult>;
  unpublish(): Promise<PageDocument>;
  getPublicPage(username: string): Promise<PublicPageResult>;
  checkUsername(username: string): Promise<{ available: boolean; reason?: 'taken' | 'reserved' | 'invalid' }>;
  getVerification(): Promise<VerificationState>;
  requestVerification(input: VerificationInput): Promise<VerificationState>;
  /** Signalement d'une page publique par un visiteur (anonyme). */
  reportPage(username: string, input: ReportInput): Promise<{ mode: 'demo' | 'live' }>;
  /** `source` = canal d'origine (paramètre `?src=` sanitisé), pour l'attribution des visites. */
  trackEvent(username: string, event: { type: 'view'; source?: string } | { type: 'click'; blockId: string; source?: string }): Promise<void>;
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
  /** Référence rôle → permissions (lecture seule, fournie par le backend). */
  getRoleMatrix(): Promise<Record<AdminRole, Permission[]>>;
}

/** Adaptateur de flux temps réel (SSE / WebSocket côté http, générateur manuel côté démo). */
export interface RealtimeAdapter {
  readonly kind: 'sse' | 'websocket' | 'demo' | 'none';
  /** Vrai si une source de données est configurée. */
  readonly available: boolean;
  connect(handlers: { onEvent(e: RealtimeEvent): void; onState(s: RealtimeState): void; onActiveVisitors?(n: number): void }): () => void;
}

export interface Api {
  mode: 'demo' | 'http';
  auth: AuthApi;
  page: PageApi;
  analytics: AnalyticsApi;
  billing: BillingApi;
  admin: AdminApi;
  realtime: RealtimeAdapter;
}
