import type { CategoryId } from './category';
import type { PlanId } from './auth';
import type { DataSourceKind, SeriesPoint, Share } from './analytics';
import type { InvoiceStatus } from './billing';
import type { PageStatus } from './page';

export type UserStatus = 'active' | 'pending' | 'suspended';

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  category: CategoryId;
  plan: PlanId;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  lastActiveAt: string;
  pageStatus: PageStatus;
  views30d: number;
}

export interface AdminUserDetail extends AdminUserRow {
  country: string;
  blocksCount: number;
  history: { at: string; event: string; actor: string }[];
}

export interface AdminProfileRow {
  id: string;
  username: string;
  owner: string;
  category: CategoryId;
  status: PageStatus;
  blocks: number;
  views30d: number;
  reports: number;
  updatedAt: string;
}

export type ReportReason = 'spam' | 'impersonation' | 'inappropriate' | 'scam' | 'copyright' | 'other';
export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';

export interface Report {
  id: string;
  username: string;
  reason: ReportReason;
  status: ReportStatus;
  priority: 'low' | 'medium' | 'high';
  reporter: string;
  details: string;
  createdAt: string;
  contentExcerpt: string;
  history: { at: string; event: string; actor: string }[];
}

export type ModerationDecision = 'dismiss' | 'warn' | 'suspend' | 'reinstate';
export type MutationOutcome = { mode: 'demo' | 'live'; applied: boolean };

export interface PaymentRow {
  id: string;
  user: string;
  plan: PlanId;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  method: 'mobile_money' | 'card' | 'bank';
  date: string;
}

export interface SubscriptionRow {
  id: string;
  user: string;
  plan: PlanId;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  renewsAt: string | null;
  startedAt: string;
}

export interface Ticket {
  id: string;
  subject: string;
  user: string;
  status: 'open' | 'pending' | 'solved';
  priority: 'low' | 'medium' | 'high';
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  level: 'info' | 'warning' | 'critical';
}

export interface SecurityEvent {
  id: string;
  at: string;
  kind: 'failed_login' | 'password_reset' | 'role_change' | 'suspicious_activity' | 'new_device';
  subject: string;
  level: 'info' | 'warning' | 'critical';
}

export interface ServiceStatus {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'down' | 'unknown';
  latencyMs: number | null;
  note?: string;
}

export interface PlatformOverview {
  source: DataSourceKind;
  kpis: {
    users: number; activeUsers: number; newAccounts: number; publishedPages: number; visits: number;
    clicks: number; subscriptions: number; revenue: number; reports: number; errors: number;
  };
  currency: string;
  series: SeriesPoint[];
  signups: { date: string; value: number }[];
  categories: Share[];
  plans: Share[];
}

export interface RealtimeEvent {
  id: string;
  at: string;
  kind: 'signup' | 'publish' | 'click' | 'report' | 'view';
  subject: string;
}

export type RealtimeState = 'disconnected' | 'connecting' | 'connected' | 'error';
