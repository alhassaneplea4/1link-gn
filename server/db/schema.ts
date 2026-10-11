/**
 * Schéma PostgreSQL de 1Link — source de vérité unique de toutes les données.
 * Principes : clés textuelles préfixées, horodatages `timestamptz` (UTC), contraintes d'intégrité au niveau
 * de la base (unicité, CHECK, clés étrangères) en plus de la validation applicative, aucun secret en clair
 * (mots de passe hachés, jetons et codes stockés sous forme de hash).
 * Après toute modification : `npm run db:generate` puis relire le SQL produit dans `drizzle/`.
 */
import { sql } from 'drizzle-orm';
import { bigint, boolean, check, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { AnyBlock } from '../../src/models/blocks.js';
import type { AppearanceConfig } from '../../src/models/appearance.js';
import type { PageShare } from '../../src/models/page.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const USER_STATUSES = ['active', 'suspended'] as const;
export const CATEGORIES = ['individual', 'creator', 'professional', 'business', 'organization'] as const;
export const ADMIN_ROLE_VALUES = ['super_admin', 'admin', 'moderator', 'support', 'analyst', 'finance'] as const;
export const PAGE_STATUSES = ['draft', 'published', 'suspended'] as const;
export const PLAN_VALUES = ['free', 'pro', 'business'] as const;
export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'pending'] as const;
export const PAYMENT_STATUSES = ['paid', 'pending', 'failed', 'refunded'] as const;
export const REPORT_REASONS = ['spam', 'impersonation', 'inappropriate', 'scam', 'copyright', 'other'] as const;
export const REPORT_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const;
export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const LEVELS = ['info', 'warning', 'critical'] as const;

/** Contenu éditable d'une page (brouillon ou instantané publié). */
export interface PageContent {
  blocks: AnyBlock[];
  appearance: AppearanceConfig;
  share: PageShare;
  category: string;
}

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    /** Toujours en minuscules. Nul pour un compte créé par téléphone. */
    email: text('email'),
    phone: text('phone'),
    passwordHash: text('password_hash'),
    name: text('name').notNull(),
    emailVerifiedAt: ts('email_verified_at'),
    phoneVerifiedAt: ts('phone_verified_at'),
    category: text('category'),
    onboardingDone: boolean('onboarding_done').notNull().default(false),
    /** Brouillon de l'assistant de configuration (reprise sur n'importe quel appareil). */
    onboardingState: jsonb('onboarding_state').$type<Record<string, unknown>>(),
    adminRole: text('admin_role'),
    status: text('status').notNull().default('active'),
    /** Badge « Profil vérifié » : accordé uniquement par la modération. */
    verified: boolean('verified').notNull().default(false),
    country: text('country'),
    /** Langue de l'interface du compte (fr | en) : langue des e-mails envoyés. */
    locale: text('locale').notNull().default('fr'),
    /** Double authentification : un code SMS est exigé après le mot de passe (téléphone vérifié requis). */
    twoFactorSms: boolean('two_factor_sms').notNull().default(false),
    termsAcceptedAt: ts('terms_accepted_at'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    lastActiveAt: ts('last_active_at'),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    uniqueIndex('users_phone_uq').on(t.phone),
    index('users_created_idx').on(t.createdAt),
    index('users_admin_role_idx').on(t.adminRole),
    check('users_contact_ck', sql`${t.email} is not null or ${t.phone} is not null`),
    check('users_email_lower_ck', sql`${t.email} is null or ${t.email} = lower(${t.email})`),
    check('users_status_ck', sql`${t.status} in (${list(USER_STATUSES)})`),
    check('users_locale_ck', sql`${t.locale} in ('fr', 'en')`),
    check('users_category_ck', sql`${t.category} is null or ${t.category} in (${list(CATEGORIES)})`),
    check('users_admin_role_ck', sql`${t.adminRole} is null or ${t.adminRole} in (${list(ADMIN_ROLE_VALUES)})`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 du jeton du cookie : une fuite de la base ne permet pas de rejouer une session. */
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash),
    index('auth_tokens_user_kind_idx').on(t.userId, t.kind),
    check('auth_tokens_kind_ck', sql`${t.kind} in ('email_verify', 'password_reset')`),
  ],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: text('id').primaryKey(),
    phone: text('phone').notNull(),
    /** HMAC(secret, téléphone + code) : le code n'est jamais stocké. */
    codeHash: text('code_hash').notNull(),
    channel: text('channel').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('otp_phone_idx').on(t.phone, t.createdAt), check('otp_channel_ck', sql`${t.channel} in ('whatsapp', 'sms')`)],
);

/** Limiteur de débit à fenêtre fixe, atomique (une seule requête SQL), partagé entre toutes les instances. */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStart: ts('window_start').notNull(),
});

export const pages = pgTable(
  'pages',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Pseudonyme public, en minuscules. */
    username: text('username'),
    status: text('status').notNull().default('draft'),
    draft: jsonb('draft').$type<PageContent>().notNull(),
    /** Instantané affiché aux visiteurs ; nul tant que la page n'a jamais été publiée. */
    published: jsonb('published').$type<PageContent>(),
    /** Incrémenté à chaque écriture : concurrence optimiste (deux onglets / appareils ne s'écrasent pas). */
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    publishedAt: ts('published_at'),
  },
  (t) => [
    uniqueIndex('pages_user_uq').on(t.userId),
    uniqueIndex('pages_username_uq').on(t.username),
    index('pages_status_idx').on(t.status),
    check('pages_username_ck', sql`${t.username} is null or ${t.username} ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$'`),
    check('pages_status_ck', sql`${t.status} in (${list(PAGE_STATUSES)})`),
  ],
);

export const media = pgTable(
  'media',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    data: bytea('data').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('media_user_hash_uq').on(t.userId, t.sha256), index('media_user_idx').on(t.userId)],
);

export const pageEvents = pgTable(
  'page_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    pageId: text('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    blockId: text('block_id'),
    source: text('source'),
    device: text('device').notNull(),
    country: text('country'),
    /** Empreinte quotidienne non réversible (sel renouvelé chaque jour) : ni IP ni identifiant durable stocké. */
    visitor: text('visitor').notNull(),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [
    index('page_events_page_at_idx').on(t.pageId, t.at),
    index('page_events_at_idx').on(t.at),
    check('page_events_kind_ck', sql`${t.kind} in ('view', 'click')`),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id').references(() => pages.id, { onDelete: 'set null' }),
    username: text('username').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    priority: text('priority').notNull().default('medium'),
    details: text('details').notNull().default(''),
    contentExcerpt: text('content_excerpt').notNull().default(''),
    /** Empreinte du signalant (jamais l'identité) : limite les abus sans fichage. */
    reporterHash: text('reporter_hash').notNull(),
    history: jsonb('history').$type<{ at: string; event: string; actor: string }[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('reports_status_idx').on(t.status, t.createdAt),
    index('reports_page_idx').on(t.pageId),
    check('reports_reason_ck', sql`${t.reason} in (${list(REPORT_REASONS)})`),
    check('reports_status_ck', sql`${t.status} in (${list(REPORT_STATUSES)})`),
    check('reports_priority_ck', sql`${t.priority} in ('low', 'medium', 'high')`),
  ],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    legalName: text('legal_name').notNull(),
    registryNumber: text('registry_number').notNull().default(''),
    proofUrl: text('proof_url').notNull(),
    note: text('note').notNull().default(''),
    status: text('status').notNull().default('pending'),
    decisionNote: text('decision_note'),
    decidedBy: text('decided_by'),
    createdAt: createdAt(),
    decidedAt: ts('decided_at'),
  },
  (t) => [
    index('verifications_user_idx').on(t.userId, t.createdAt),
    // Une seule demande en attente par utilisateur.
    uniqueIndex('verifications_one_pending_uq').on(t.userId).where(sql`${t.status} = 'pending'`),
    check('verifications_status_ck', sql`${t.status} in (${list(VERIFICATION_STATUSES)})`),
    check('verifications_kind_ck', sql`${t.kind} in ('person', 'business', 'organization')`),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull().default('free'),
    status: text('status').notNull().default('active'),
    period: text('period').notNull().default('monthly'),
    renewsAt: ts('renews_at'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    provider: text('provider'),
    providerRef: text('provider_ref'),
    startedAt: ts('started_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subscriptions_user_uq').on(t.userId),
    check('subscriptions_plan_ck', sql`${t.planId} in (${list(PLAN_VALUES)})`),
    check('subscriptions_status_ck', sql`${t.status} in (${list(SUBSCRIPTION_STATUSES)})`),
    check('subscriptions_period_ck', sql`${t.period} in ('monthly', 'yearly')`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    planId: text('plan_id').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('GNF'),
    status: text('status').notNull(),
    method: text('method').notNull(),
    provider: text('provider'),
    providerRef: text('provider_ref'),
    createdAt: createdAt(),
  },
  (t) => [
    index('payments_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('payments_provider_ref_uq').on(t.provider, t.providerRef),
    check('payments_status_ck', sql`${t.status} in (${list(PAYMENT_STATUSES)})`),
    check('payments_method_ck', sql`${t.method} in ('mobile_money', 'card', 'bank')`),
    check('payments_amount_ck', sql`${t.amount} >= 0`),
  ],
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    subject: text('subject').notNull(),
    status: text('status').notNull().default('open'),
    priority: text('priority').notNull().default('medium'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('tickets_status_idx').on(t.status, t.updatedAt),
    check('tickets_status_ck', sql`${t.status} in ('open', 'pending', 'solved')`),
    check('tickets_priority_ck', sql`${t.priority} in ('low', 'medium', 'high')`),
  ],
);

/** Journal d'audit des actions sensibles (modération, rôles, suspensions). Append-only. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    at: ts('at').notNull().defaultNow(),
    actorId: text('actor_id'),
    actorLabel: text('actor_label').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull(),
    ip: text('ip'),
    level: text('level').notNull().default('info'),
  },
  (t) => [index('audit_at_idx').on(t.at), index('audit_target_idx').on(t.target), check('audit_level_ck', sql`${t.level} in (${list(LEVELS)})`)],
);

export const securityEvents = pgTable(
  'security_events',
  {
    id: text('id').primaryKey(),
    at: ts('at').notNull().defaultNow(),
    kind: text('kind').notNull(),
    subject: text('subject').notNull(),
    userId: text('user_id'),
    ip: text('ip'),
    level: text('level').notNull().default('info'),
  },
  (t) => [
    index('security_at_idx').on(t.at),
    check('security_kind_ck', sql`${t.kind} in ('failed_login', 'password_reset', 'role_change', 'suspicious_activity', 'new_device')`),
    check('security_level_ck', sql`${t.level} in (${list(LEVELS)})`),
  ],
);

/** Flux d'activité de la plateforme (inscriptions, publications, signalements) pour le temps réel de l'Admin Center. */
export const activityEvents = pgTable(
  'activity_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    at: ts('at').notNull().defaultNow(),
    kind: text('kind').notNull(),
    subject: text('subject').notNull(),
  },
  (t) => [index('activity_at_idx').on(t.at), check('activity_kind_ck', sql`${t.kind} in ('signup', 'publish', 'report')`)],
);

export const appErrors = pgTable(
  'app_errors',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    at: ts('at').notNull().defaultNow(),
    route: text('route').notNull(),
    message: text('message').notNull(),
  },
  (t) => [index('app_errors_at_idx').on(t.at)],
);
