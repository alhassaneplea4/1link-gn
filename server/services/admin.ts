/** Admin Center : listes, détail, modération et statuts — toutes les données viennent de PostgreSQL. */
import { eq, sql } from 'drizzle-orm';
import type { AuthContext, C, Deps } from '../context.js';
import { auditLogs, pages, reports, users } from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { runList, type ListSpec } from '../lib/lists.js';
import { accountNoticeMessage, moderationWarningMessage } from '../lib/emails.js';
import { notify, notifyById } from './notifications.js';
import { endUserSessions } from './sessions.js';
import { toRequest } from './verification.js';
import type { ListQuery, Paged } from '../../src/models/api.js';
import type {
  AdminProfileRow, AdminUserDetail, AdminUserRow, AuditLog, ModerationDecision, PaymentRow, Report, SecurityEvent, ServiceStatus, SubscriptionRow, Ticket,
} from '../../src/models/admin.js';
import type { CategoryId } from '../../src/models/category.js';
import type { PlanId } from '../../src/models/auth.js';
import type { VerificationRequest } from '../../src/models/verification.js';
import type { PageStatus } from '../../src/models/page.js';

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d));
const isoOrNull = (d: unknown) => (d ? iso(d) : null);
const paged = <T>(r: { rows: unknown[]; total: number; page: number; pageSize: number }, map: (row: never) => T): Paged<T> => ({ items: r.rows.map((x) => map(x as never)), total: r.total, page: r.page, pageSize: r.pageSize });

// — Utilisateurs —

const PLAN_EXPR = sql`coalesce(case when s.status in ('active', 'trialing', 'past_due') then s.plan_id end, 'free')`;
const USER_STATUS_EXPR = sql`case when u.status = 'suspended' then 'suspended' when u.email_verified_at is null and u.phone_verified_at is null then 'pending' else 'active' end`;
const VIEWS30 = (pageId: string) => sql.raw(`(select count(*) from page_events e where e.page_id = ${pageId} and e.kind = 'view' and e.at >= now() - interval '30 days')::int`);
const PAGE_STATUS_EXPR = sql`case when u.status = 'suspended' or p.status = 'suspended' then 'suspended' when p.status = 'published' then 'published' else 'draft' end`;

const usersSpec: ListSpec = {
  from: sql`users u left join pages p on p.user_id = u.id left join subscriptions s on s.user_id = u.id`,
  select: sql`u.id, u.name, u.email, u.phone, p.username, u.category, ${PLAN_EXPR} as plan, ${USER_STATUS_EXPR} as status,
    (u.email_verified_at is not null or u.phone_verified_at is not null) as verified, u.created_at, coalesce(u.last_active_at, u.created_at) as last_active_at,
    ${PAGE_STATUS_EXPR} as page_status, ${VIEWS30('p.id')} as views30d, u.country, coalesce(jsonb_array_length(p.draft->'blocks'), 0)::int as blocks_count`,
  searchColumns: [sql`u.name`, sql`u.email`, sql`u.phone`, sql`p.username`, sql`u.id`],
  filters: { category: sql`u.category`, plan: PLAN_EXPR, status: USER_STATUS_EXPR },
  sorts: {
    name: sql`lower(u.name)`, email: sql`u.email`, category: sql`u.category`, plan: PLAN_EXPR, status: USER_STATUS_EXPR, createdAt: sql`u.created_at`,
    lastActiveAt: sql`coalesce(u.last_active_at, u.created_at)`, views30d: VIEWS30('p.id'), pageStatus: PAGE_STATUS_EXPR,
  },
  defaultSort: 'createdAt', defaultDir: 'desc', tiebreak: sql`u.id`,
};

type UserRaw = Record<string, unknown> & { id: string; name: string; email: string | null; phone: string | null; username: string | null; category: string | null; plan: PlanId; status: AdminUserRow['status'];
  verified: boolean; created_at: Date; last_active_at: Date; page_status: PageStatus; views30d: number; country: string | null; blocks_count: number };

const userRow = (r: UserRaw): AdminUserRow => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, username: r.username, category: r.category as CategoryId | null, plan: r.plan, status: r.status,
  emailVerified: r.verified, createdAt: iso(r.created_at), lastActiveAt: iso(r.last_active_at), pageStatus: r.page_status, views30d: r.views30d,
});

export async function listUsers(deps: Deps, q: ListQuery) {
  return paged(await runList(deps.db, usersSpec, q), userRow);
}

export async function getUserDetail(deps: Deps, id: string): Promise<AdminUserDetail> {
  const r = await runList<UserRaw>(deps.db, { ...usersSpec, baseWhere: sql`u.id = ${id}` }, { page: 1, pageSize: 1 });
  const raw = r.rows[0];
  if (!raw) throw notFound('user');
  const [account] = await deps.db.select({ emailVerifiedAt: users.emailVerifiedAt, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, id)).limit(1);
  const targets = raw.username ? sql`${auditLogs.target} in (${id}, ${raw.username})` : sql`${auditLogs.target} = ${id}`; // un compte sans page n'a pas de pseudonyme
  const logs = await deps.db.select().from(auditLogs).where(targets).orderBy(sql`${auditLogs.at} desc`).limit(30);
  const history: AdminUserDetail['history'] = [
    ...logs.map((l) => ({ at: iso(l.at), event: l.action, actor: l.actorLabel })),
    ...(account?.emailVerifiedAt ? [{ at: iso(account.emailVerifiedAt), event: 'E-mail vérifié', actor: 'Système' }] : []),
    ...(account?.phoneVerifiedAt ? [{ at: iso(account.phoneVerifiedAt), event: 'Téléphone vérifié', actor: 'Système' }] : []),
    { at: iso(raw.last_active_at), event: 'Dernière activité', actor: raw.name },
    { at: iso(raw.created_at), event: 'Compte créé', actor: raw.name },
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { ...userRow(raw), country: raw.country ?? '—', blocksCount: raw.blocks_count, history };
}

const ROLE_RANK: Record<string, number> = { analyst: 1, finance: 1, support: 1, moderator: 2, admin: 3, super_admin: 4 };

export async function setUserStatus(c: C, deps: Deps, actor: AuthContext, userId: string, status: 'active' | 'suspended'): Promise<void> {
  if (userId === actor.user.id) throw forbidden('cannot_modify_self');
  const now = deps.now();
  const [target] = await deps.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw notFound('user');
  // On ne suspend pas un compte de rang égal ou supérieur, sauf le super administrateur.
  if (target.adminRole && actor.user.adminRole !== 'super_admin' && (ROLE_RANK[target.adminRole] ?? 0) >= (ROLE_RANK[actor.user.adminRole ?? ''] ?? 0)) throw forbidden('insufficient_role');
  await deps.db.update(users).set({ status, updatedAt: now }).where(eq(users.id, userId));
  if (status === 'suspended') await endUserSessions(deps, userId);
  notify(deps, target, (to, name, locale) => accountNoticeMessage(to, name, status === 'suspended' ? 'account_suspended' : 'account_reinstated', locale));
  await audit(deps.db, { actorId: actor.user.id, actorLabel: actor.user.name, action: status === 'suspended' ? 'Compte suspendu' : 'Compte réactivé', target: userId, ip: c.get('ip'), level: status === 'suspended' ? 'warning' : 'info' }, now);
}

// — Profils (pages) —

const PROFILE_STATUS = sql`case when u.status = 'suspended' or p.status = 'suspended' then 'suspended' when p.status = 'published' then 'published' else 'draft' end`;
const profilesSpec: ListSpec = {
  from: sql`pages p join users u on u.id = p.user_id`,
  select: sql`p.id, p.username, u.name as owner, coalesce(p.draft->>'category', u.category) as category, ${PROFILE_STATUS} as status,
    jsonb_array_length(p.draft->'blocks')::int as blocks, ${VIEWS30('p.id')} as views30d, (select count(*) from reports r where r.page_id = p.id)::int as reports, p.updated_at`,
  baseWhere: sql`p.username is not null`,
  searchColumns: [sql`p.username`, sql`u.name`],
  filters: { status: PROFILE_STATUS, category: sql`coalesce(p.draft->>'category', u.category)` },
  sorts: {
    username: sql`p.username`, category: sql`coalesce(p.draft->>'category', u.category)`, status: PROFILE_STATUS, blocks: sql`jsonb_array_length(p.draft->'blocks')`,
    views30d: VIEWS30('p.id'), reports: sql`(select count(*) from reports r where r.page_id = p.id)`, updatedAt: sql`p.updated_at`,
  },
  defaultSort: 'updatedAt', defaultDir: 'desc', tiebreak: sql`p.id`,
};

export async function listProfiles(deps: Deps, q: ListQuery) {
  return paged<AdminProfileRow>(await runList(deps.db, profilesSpec, q), (r: Record<string, unknown>) => ({
    id: r.id as string, username: r.username as string, owner: r.owner as string, category: r.category as CategoryId, status: r.status as PageStatus,
    blocks: r.blocks as number, views30d: r.views30d as number, reports: r.reports as number, updatedAt: iso(r.updated_at),
  }));
}

// — Signalements et modération —

const PRIORITY_RANK = sql`array_position(array['high', 'medium', 'low'], r.priority)`;
const reportsSpec: ListSpec = {
  from: sql`reports r`,
  select: sql`r.id, r.username, r.reason, r.status, r.priority, r.details, r.content_excerpt, r.created_at, r.history`,
  searchColumns: [sql`r.username`, sql`r.id`, sql`r.details`],
  filters: { status: sql`r.status`, reason: sql`r.reason`, priority: sql`r.priority` },
  sorts: { id: sql`r.id`, username: sql`r.username`, reason: sql`r.reason`, priority: PRIORITY_RANK, status: sql`r.status`, createdAt: sql`r.created_at` },
  defaultSort: 'createdAt', defaultDir: 'desc', tiebreak: sql`r.id`,
};

const reportRow = (r: Record<string, unknown>): Report => ({
  id: r.id as string, username: r.username as string, reason: r.reason as Report['reason'], status: r.status as Report['status'], priority: r.priority as Report['priority'],
  reporter: 'Visiteur anonyme', details: r.details as string, createdAt: iso(r.created_at), contentExcerpt: r.content_excerpt as string, history: r.history as Report['history'],
});

export async function listReports(deps: Deps, q: ListQuery) {
  return paged(await runList(deps.db, reportsSpec, q), reportRow);
}

export async function getReport(deps: Deps, id: string): Promise<Report> {
  const r = await runList<Record<string, unknown>>(deps.db, { ...reportsSpec, baseWhere: sql`r.id = ${id}` }, { page: 1, pageSize: 1 });
  if (!r.rows[0]) throw notFound('report');
  return reportRow(r.rows[0]);
}

const LABELS: Record<ModerationDecision, string> = { dismiss: 'Signalement classé sans suite', warn: 'Avertissement envoyé au propriétaire', suspend: 'Page suspendue', reinstate: 'Page réactivée' };

export async function applyDecision(c: C, deps: Deps, actor: AuthContext, reportId: string, decision: ModerationDecision, note: string): Promise<void> {
  const now = deps.now();
  const trimmed = note.trim().slice(0, 500);
  let warn: { email: string; name: string; locale: string } | null = null;
  let notice: { userId: string; kind: 'page_suspended' | 'page_reinstated' } | null = null;
  await deps.db.transaction(async (tx) => {
    const [rep] = await tx.select().from(reports).where(eq(reports.id, reportId)).for('update').limit(1);
    if (!rep) throw notFound('report');
    if (rep.status === 'resolved' || rep.status === 'dismissed') throw conflict('already_decided');
    const history = [...rep.history, { at: now.toISOString(), event: `${LABELS[decision]}${trimmed ? ` — ${trimmed}` : ''}`, actor: actor.user.name }];
    await tx.update(reports).set({ status: decision === 'dismiss' ? 'dismissed' : 'resolved', history, updatedAt: now }).where(eq(reports.id, reportId));
    const [page] = rep.pageId ? await tx.select().from(pages).where(eq(pages.id, rep.pageId)).limit(1) : [];
    if (page && decision === 'suspend') {
      await tx.update(pages).set({ status: 'suspended', updatedAt: now }).where(eq(pages.id, page.id));
      notice = { userId: page.userId, kind: 'page_suspended' };
    }
    if (page && decision === 'reinstate') {
      await tx.update(pages).set({ status: page.published ? 'published' : 'draft', updatedAt: now }).where(eq(pages.id, page.id));
      notice = { userId: page.userId, kind: 'page_reinstated' };
    }
    if (page && decision === 'warn') {
      const [owner] = await tx.select({ email: users.email, name: users.name, locale: users.locale }).from(users).where(eq(users.id, page.userId)).limit(1);
      if (owner?.email) warn = { email: owner.email, name: owner.name, locale: owner.locale };
    }
    await audit(tx, { actorId: actor.user.id, actorLabel: actor.user.name, action: `${LABELS[decision]} (${reportId})`, target: rep.username, ip: c.get('ip'), level: decision === 'suspend' ? 'warning' : 'info' }, now);
  });
  const w = warn as { email: string; name: string; locale: string } | null;
  if (w) notify(deps, w, (to, name, locale) => moderationWarningMessage(to, name, trimmed, locale));
  const n = notice as { userId: string; kind: 'page_suspended' | 'page_reinstated' } | null;
  if (n) await notifyById(deps, n.userId, (to, name, locale) => accountNoticeMessage(to, name, n.kind, locale));
}

// — Vérifications —

const verifSpec: ListSpec = {
  from: sql`verifications v join users u on u.id = v.user_id left join pages p on p.user_id = u.id`,
  select: sql`v.*, p.username, u.name as owner`,
  searchColumns: [sql`p.username`, sql`u.name`, sql`v.legal_name`, sql`v.id`],
  filters: { status: sql`v.status`, kind: sql`v.kind` },
  sorts: { username: sql`p.username`, owner: sql`u.name`, kind: sql`v.kind`, status: sql`v.status`, createdAt: sql`v.created_at`, legalName: sql`v.legal_name`, id: sql`v.id` },
  defaultSort: 'createdAt', defaultDir: 'desc', tiebreak: sql`v.id`,
};

export async function listVerifications(deps: Deps, q: ListQuery) {
  return paged<VerificationRequest>(await runList(deps.db, verifSpec, q), (r: Record<string, unknown>) =>
    toRequest(
      { id: r.id, userId: r.user_id, kind: r.kind, legalName: r.legal_name, registryNumber: r.registry_number, proofUrl: r.proof_url, note: r.note, status: r.status, decisionNote: r.decision_note, decidedBy: r.decided_by, createdAt: r.created_at, decidedAt: r.decided_at } as never,
      (r.username as string | null) ?? '', r.owner as string,
    ),
  );
}

// — Abonnements, paiements, support, journaux —

const subsSpec: ListSpec = {
  from: sql`subscriptions s join users u on u.id = s.user_id`,
  select: sql`s.id, u.name as "user", s.plan_id as plan, s.status, s.renews_at, s.started_at`,
  searchColumns: [sql`u.name`, sql`s.id`],
  filters: { plan: sql`s.plan_id`, status: sql`s.status` },
  sorts: { user: sql`lower(u.name)`, plan: sql`s.plan_id`, status: sql`s.status`, renewsAt: sql`s.renews_at`, startedAt: sql`s.started_at`, id: sql`s.id` },
  defaultSort: 'startedAt', defaultDir: 'desc', tiebreak: sql`s.id`,
};
export async function listSubscriptions(deps: Deps, q: ListQuery) {
  return paged<SubscriptionRow>(await runList(deps.db, subsSpec, q), (r: Record<string, unknown>) => ({
    id: r.id as string, user: r.user as string, plan: r.plan as PlanId, status: r.status as SubscriptionRow['status'], renewsAt: isoOrNull(r.renews_at), startedAt: iso(r.started_at),
  }));
}

const paySpec: ListSpec = {
  from: sql`payments p join users u on u.id = p.user_id`,
  select: sql`p.id, u.name as "user", p.plan_id as plan, p.amount, p.currency, p.status, p.method, p.created_at`,
  searchColumns: [sql`u.name`, sql`p.id`],
  filters: { status: sql`p.status`, method: sql`p.method`, plan: sql`p.plan_id` },
  sorts: { user: sql`lower(u.name)`, plan: sql`p.plan_id`, amount: sql`p.amount`, status: sql`p.status`, method: sql`p.method`, date: sql`p.created_at`, id: sql`p.id` },
  defaultSort: 'date', defaultDir: 'desc', tiebreak: sql`p.id`,
};
export async function listPayments(deps: Deps, q: ListQuery) {
  return paged<PaymentRow>(await runList(deps.db, paySpec, q), (r: Record<string, unknown>) => ({
    id: r.id as string, user: r.user as string, plan: r.plan as PlanId, amount: r.amount as number, currency: r.currency as string, status: r.status as PaymentRow['status'],
    method: r.method as PaymentRow['method'], date: iso(r.created_at),
  }));
}

const ticketSpec: ListSpec = {
  from: sql`support_tickets t left join users u on u.id = t.user_id`,
  select: sql`t.id, t.subject, coalesce(u.name, '—') as "user", t.status, t.priority, t.updated_at`,
  searchColumns: [sql`t.subject`, sql`u.name`, sql`t.id`],
  filters: { status: sql`t.status`, priority: sql`t.priority` },
  sorts: { subject: sql`t.subject`, user: sql`lower(u.name)`, status: sql`t.status`, priority: sql`array_position(array['high', 'medium', 'low'], t.priority)`, updatedAt: sql`t.updated_at`, id: sql`t.id` },
  defaultSort: 'updatedAt', defaultDir: 'desc', tiebreak: sql`t.id`,
};
export async function listTickets(deps: Deps, q: ListQuery) {
  return paged<Ticket>(await runList(deps.db, ticketSpec, q), (r: Record<string, unknown>) => ({
    id: r.id as string, subject: r.subject as string, user: r.user as string, status: r.status as Ticket['status'], priority: r.priority as Ticket['priority'], updatedAt: iso(r.updated_at),
  }));
}

const logSpec: ListSpec = {
  from: sql`audit_logs a`,
  select: sql`a.id, a.at, a.actor_label, a.action, a.target, a.ip, a.level`,
  searchColumns: [sql`a.actor_label`, sql`a.action`, sql`a.target`, sql`a.ip`],
  filters: { level: sql`a.level` },
  sorts: { at: sql`a.at`, actor: sql`a.actor_label`, action: sql`a.action`, target: sql`a.target`, ip: sql`a.ip`, level: sql`a.level` },
  defaultSort: 'at', defaultDir: 'desc', tiebreak: sql`a.id`,
};
export async function listAuditLogs(deps: Deps, q: ListQuery) {
  return paged<AuditLog>(await runList(deps.db, logSpec, q), (r: Record<string, unknown>) => ({
    id: r.id as string, at: iso(r.at), actor: r.actor_label as string, action: r.action as string, target: r.target as string, ip: (r.ip as string | null) ?? '—', level: r.level as AuditLog['level'],
  }));
}

const secSpec: ListSpec = {
  from: sql`security_events e`,
  select: sql`e.id, e.at, e.kind, e.subject, e.level`,
  searchColumns: [sql`e.subject`, sql`e.kind`],
  filters: { kind: sql`e.kind`, level: sql`e.level` },
  sorts: { at: sql`e.at`, kind: sql`e.kind`, subject: sql`e.subject`, level: sql`e.level` },
  defaultSort: 'at', defaultDir: 'desc', tiebreak: sql`e.id`,
};
export async function listSecurityEvents(deps: Deps, q: ListQuery) {
  return paged<SecurityEvent>(await runList(deps.db, secSpec, q), (r: Record<string, unknown>) => ({
    id: r.id as string, at: iso(r.at), kind: r.kind as SecurityEvent['kind'], subject: r.subject as string, level: r.level as SecurityEvent['level'],
  }));
}

// — Santé du système (mesures réelles) —

export async function systemStatus(deps: Deps): Promise<ServiceStatus[]> {
  const t0 = performance.now();
  let db: ServiceStatus = { id: 'db', name: 'Base de données PostgreSQL', status: 'operational', latencyMs: null };
  try {
    await deps.db.execute(sql`select 1`);
    db = { ...db, latencyMs: Math.round(performance.now() - t0) };
  } catch {
    db = { ...db, status: 'down', note: 'Connexion impossible' };
  }
  const t1 = performance.now();
  const lastError = await deps.db.execute<{ n: number }>(sql`select count(*)::int as n from app_errors where at >= ${deps.now()}::timestamptz - interval '1 hour'`).then((r) => r.rows[0]?.n ?? 0).catch(() => -1);
  const api: ServiceStatus = { id: 'api', name: 'API principale', status: lastError > 20 ? 'degraded' : 'operational', latencyMs: Math.round(performance.now() - t1), note: lastError > 0 ? `${lastError} erreur(s) serveur sur la dernière heure` : undefined };
  const providerStatus = (id: string, name: string, provider: string, devNote: string): ServiceStatus =>
    provider === 'none' ? { id, name, status: 'unknown', latencyMs: null, note: 'Fournisseur non configuré' } : provider === 'dev' ? { id, name, status: 'degraded', latencyMs: null, note: devNote } : { id, name, status: 'operational', latencyMs: null, note: `Fournisseur : ${provider}` };
  return [
    api, db,
    { id: 'storage', name: 'Stockage des médias', status: db.status === 'down' ? 'down' : 'operational', latencyMs: db.latencyMs, note: 'Stocké dans PostgreSQL' },
    providerStatus('mail', 'E-mails transactionnels', deps.config.mail.provider, 'Mode développement : aucun e-mail réel'),
    providerStatus('otp', 'Codes WhatsApp / SMS', deps.config.otp.provider, 'Mode développement : aucun message réel'),
    { id: 'payments', name: 'Passerelle de paiement', status: 'unknown', latencyMs: null, note: 'Non connectée (transactions directes prévues plus tard)' },
  ];
}

