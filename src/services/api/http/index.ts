/**
 * Adaptateurs HTTP : implémentation « production » du contrat `Api`.
 * Les chemins ci-dessous sont des HYPOTHÈSES de contrat REST à confirmer avec l'équipe backend ;
 * seuls ces fichiers changeront à ce moment-là, aucun composant.
 */
import type { ListQuery } from '@/models/api';
import type { Session } from '@/models/auth';
import type { PageDocument, PublicPageResult } from '@/models/page';
import type { Api, AdminApi, AnalyticsApi, AuthApi, BillingApi, PageApi, PublishResult } from '../types';
import { request } from './client';
import { sseRealtime } from './realtime';

const q = (l: ListQuery) => ({ page: l.page, pageSize: l.pageSize, search: l.search, sort: l.sort, dir: l.dir, ...l.filters });

const auth: AuthApi = {
  getSession: () => request<Session | null>('GET', '/auth/session').catch((e) => (e?.code === 'unauthorized' ? null : Promise.reject(e))),
  signIn: (email, password) => request('POST', '/auth/sign-in', { body: { email, password } }),
  signUp: (input) => request('POST', '/auth/sign-up', { body: input }),
  signOut: () => request('POST', '/auth/sign-out'),
  requestPasswordReset: (email) => request('POST', '/auth/password/forgot', { body: { email } }),
  resetPassword: (token, password) => request('POST', '/auth/password/reset', { body: { token, password } }),
  verifyEmail: (token) => request('POST', '/auth/email/verify', { body: { token } }),
  resendVerification: () => request('POST', '/auth/email/resend'),
};

const page: PageApi = {
  getMyPage: () => request<PageDocument | null>('GET', '/me/page'),
  saveDraft: (doc) => request('PUT', '/me/page/draft', { body: doc }),
  publish: (doc) => request<PageDocument>('POST', '/me/page/publish', { body: doc }).then((p): PublishResult => ({ page: p, mode: 'live' })),
  unpublish: () => request('POST', '/me/page/unpublish'),
  getPublicPage: (username) => request<PublicPageResult>('GET', `/pages/${encodeURIComponent(username)}`),
  checkUsername: (username) => request('GET', '/usernames/check', { query: { username } }),
  trackEvent: (username, event) => request('POST', `/pages/${encodeURIComponent(username)}/events`, { body: event }),
};

const analytics: AnalyticsApi = {
  getReport: (range) => request('GET', '/me/analytics', { query: { from: range.from, to: range.to, preset: range.preset } }),
};

const billing: BillingApi = {
  getSubscription: () => request('GET', '/me/subscription'),
  listInvoices: () => request('GET', '/me/invoices'),
  changePlan: (planId, period) => request('POST', '/me/subscription/change', { body: { planId, period } }),
  cancel: () => request('POST', '/me/subscription/cancel'),
  resume: () => request('POST', '/me/subscription/resume'),
};

const admin: AdminApi = {
  getOverview: (r) => request('GET', '/admin/overview', { query: { from: r.from, to: r.to } }),
  listUsers: (l) => request('GET', '/admin/users', { query: q(l) }),
  getUser: (id) => request('GET', `/admin/users/${encodeURIComponent(id)}`),
  listProfiles: (l) => request('GET', '/admin/profiles', { query: q(l) }),
  listReports: (l) => request('GET', '/admin/reports', { query: q(l) }),
  getReport: (id) => request('GET', `/admin/reports/${encodeURIComponent(id)}`),
  applyDecision: (id, decision, note) => request('POST', `/admin/reports/${encodeURIComponent(id)}/decision`, { body: { decision, note } }),
  setUserStatus: (id, status) => request('PATCH', `/admin/users/${encodeURIComponent(id)}/status`, { body: { status } }),
  listSubscriptions: (l) => request('GET', '/admin/subscriptions', { query: q(l) }),
  listPayments: (l) => request('GET', '/admin/payments', { query: q(l) }),
  listTickets: (l) => request('GET', '/admin/tickets', { query: q(l) }),
  listAuditLogs: (l) => request('GET', '/admin/logs', { query: q(l) }),
  listSecurityEvents: (l) => request('GET', '/admin/security/events', { query: q(l) }),
  getSystemStatus: () => request('GET', '/admin/system/status'),
  getRoleMatrix: () => request('GET', '/admin/roles'),
};

export const httpApi: Api = { mode: 'http', auth, page, analytics, billing, admin, realtime: sseRealtime };
