/**
 * Client de l'API 1Link (serveur Hono + PostgreSQL, dossier `server/`).
 * Sessions par cookie httpOnly (jamais de jeton lisible par JavaScript) ; les chemins ci-dessous sont ceux des routes du serveur.
 */
import type { ListQuery } from '@/models/api';
import type { Session, SignInResult, TwoFactorChallenge } from '@/models/auth';
import type { PageDocument, PublicPageResult } from '@/models/page';
import type { Api, AdminApi, AnalyticsApi, AuthApi, BillingApi, PageApi } from '../types';
import { request } from './client';
import { sseRealtime } from './realtime';

const q = (l: ListQuery) => ({ page: l.page, pageSize: l.pageSize, search: l.search, sort: l.sort, dir: l.dir, ...l.filters });
const seg = encodeURIComponent;

const auth: AuthApi = {
  getCapabilities: () => request('GET', '/capabilities'),
  getSession: () => request<Session | null>('GET', '/auth/session'),
  signIn: (email, password) =>
    request<Session | { twoFactor: TwoFactorChallenge }>('POST', '/auth/sign-in', { body: { email, password } }).then(
      (r): SignInResult => ('twoFactor' in r ? { kind: 'two_factor', challenge: r.twoFactor } : { kind: 'session', session: r }),
    ),
  completeTwoFactor: (challenge, code) => request('POST', '/auth/sign-in/2fa', { body: { challenge, code } }),
  resendTwoFactor: (challenge) => request('POST', '/auth/sign-in/2fa/resend', { body: { challenge } }),
  requestPhoneReset: (phone) => request('POST', '/auth/password/forgot-phone', { body: { phone } }),
  resetPasswordByPhone: (input) => request('POST', '/auth/password/reset-phone', { body: input }),
  requestPhoneLink: (input) => request('POST', '/me/phone/request', { body: input }),
  verifyPhoneLink: (input) => request('POST', '/me/phone/verify', { body: input }),
  removePhone: (password) => request('POST', '/me/phone/remove', { body: { password } }),
  requestAccountDeletionCode: () => request('POST', '/me/delete/request'),
  deleteAccount: (input) => request<void>('POST', '/me/delete', { body: input }),
  setTwoFactor: (enabled, password) => request('POST', '/me/2fa', { body: { enabled, password } }),
  signUp: (input) => request('POST', '/auth/sign-up', { body: input }),
  signOut: () => request('POST', '/auth/sign-out'),
  requestOtp: (input) => request('POST', '/auth/otp/request', { body: input }),
  verifyOtp: (input) => request('POST', '/auth/otp/verify', { body: input }),
  requestPasswordReset: (email) => request('POST', '/auth/password/forgot', { body: { email } }),
  resetPassword: (token, password) => request('POST', '/auth/password/reset', { body: { token, password } }),
  verifyEmail: (token) => request('POST', '/auth/email/verify', { body: { token } }),
  resendVerification: () => request('POST', '/auth/email/resend'),
};

const page: PageApi = {
  getMyPage: () => request<PageDocument | null>('GET', '/me/page'),
  saveDraft: (doc) => request('PUT', '/me/page/draft', { body: doc }),
  publish: (doc) => request<PageDocument>('POST', '/me/page/publish', { body: doc }),
  unpublish: () => request('POST', '/me/page/unpublish'),
  getPublicPage: (username) => request<PublicPageResult>('GET', `/pages/${seg(username)}`),
  checkUsername: (username) => request('GET', '/usernames/check', { query: { username } }),
  getVerification: () => request('GET', '/me/verification'),
  requestVerification: (input) => request('POST', '/me/verification', { body: input }),
  reportPage: (username, input) => request<void>('POST', `/pages/${seg(username)}/reports`, { body: input }),
  trackEvent: (username, event) => request('POST', `/pages/${seg(username)}/events`, { body: event }),
  getOnboardingState: () => request<{ state: Record<string, unknown> | null }>('GET', '/me/onboarding').then((r) => r.state),
  saveOnboardingState: (state) => request('PUT', '/me/onboarding', { body: { state } }),
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
  getUser: (id) => request('GET', `/admin/users/${seg(id)}`),
  listProfiles: (l) => request('GET', '/admin/profiles', { query: q(l) }),
  listReports: (l) => request('GET', '/admin/reports', { query: q(l) }),
  getReport: (id) => request('GET', `/admin/reports/${seg(id)}`),
  applyDecision: (id, decision, note) => request('POST', `/admin/reports/${seg(id)}/decision`, { body: { decision, note } }),
  setUserStatus: (id, status) => request('PATCH', `/admin/users/${seg(id)}/status`, { body: { status } }),
  listVerifications: (l) => request('GET', '/admin/verifications', { query: q(l) }),
  decideVerification: (id, decision, note) => request('POST', `/admin/verifications/${seg(id)}/decision`, { body: { decision, note } }),
  listSubscriptions: (l) => request('GET', '/admin/subscriptions', { query: q(l) }),
  listPayments: (l) => request('GET', '/admin/payments', { query: q(l) }),
  listTickets: (l) => request('GET', '/admin/tickets', { query: q(l) }),
  listAuditLogs: (l) => request('GET', '/admin/logs', { query: q(l) }),
  listSecurityEvents: (l) => request('GET', '/admin/security/events', { query: q(l) }),
  getSystemStatus: () => request('GET', '/admin/system/status'),
  getRoleMatrix: () => request('GET', '/admin/roles'),
};

export const httpApi: Api = { auth, page, analytics, billing, admin, realtime: sseRealtime };
