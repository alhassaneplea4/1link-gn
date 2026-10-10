import { ApiError, type ListQuery, type Paged } from '@/models/api';
import type { AdminUserDetail, PlatformOverview, Report, ServiceStatus } from '@/models/admin';
import type { VerificationRequest } from '@/models/verification';
import type { AdminApi } from '../types';
import { addDays, hashSeed, isoDay, rng } from './prng';
import { delay, readDb, writeDb } from './db';
import { getSeed } from './seed';
import { requireDemoUser } from './auth';
import { DEMO_ROLE_PERMISSIONS } from './permissions';

/** Filtre + tri + pagination côté « serveur » simulé. Les filtres `all`/vides sont ignorés. */
export function listFrom<T extends object>(rows: readonly T[], q: ListQuery, searchKeys: (keyof T)[]): Paged<T> {
  let out = [...rows];
  const term = q.search?.trim().toLowerCase();
  if (term) out = out.filter((row) => searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(term)));
  for (const [k, v] of Object.entries(q.filters ?? {})) {
    if (!v || v === 'all') continue;
    out = out.filter((row) => String((row as Record<string, unknown>)[k]) === v);
  }
  if (q.sort) {
    const dir = q.dir === 'desc' ? -1 : 1;
    out.sort((a, b) => {
      const av = (a as Record<string, unknown>)[q.sort!];
      const bv = (b as Record<string, unknown>)[q.sort!];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? ''), 'fr', { numeric: true }) * dir;
    });
  }
  const start = (q.page - 1) * q.pageSize;
  return { items: out.slice(start, start + q.pageSize), total: out.length, page: q.page, pageSize: q.pageSize };
}

const guard = () => requireDemoUser();
const allVerifications = (): VerificationRequest[] => {
  const db = readDb();
  const own = Object.values(db.verifications ?? {});
  return [...own, ...getSeed().verifications].map((v) => ({ ...v, ...(db.verificationOverrides?.[v.id] ?? {}) }));
};
const withOverrides = (r: Report): Report => {
  const o = readDb().moderation[r.id];
  return o ? { ...r, status: o.status, history: [...r.history, ...o.history] } : r;
};

export const demoAdmin: AdminApi = {
  async getOverview(range) {
    guard();
    const seed = getSeed();
    const rg = rng(hashSeed(`overview:${range.from}:${range.to}`));
    const start = new Date(range.from);
    const days = Math.max(1, Math.round((new Date(range.to).getTime() - start.getTime()) / 86_400_000) + 1);
    const series = Array.from({ length: days }, (_, i) => {
      const views = rg.int(2600, 5200) + i * 18;
      return { date: isoDay(addDays(start, i)), views, visitors: Math.round(views * 0.72), clicks: Math.round(views * 0.34) };
    });
    const sum = (k: 'views' | 'clicks') => series.reduce((a, p) => a + p[k], 0);
    const count = <K extends string>(items: { [P in K]: string }[], key: K) => {
      const m = new Map<string, number>();
      items.forEach((i) => m.set(i[key], (m.get(i[key]) ?? 0) + 1));
      return [...m.entries()].map(([name, value]) => ({ name, value }));
    };
    const paid = seed.payments.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0);
    const out: PlatformOverview = {
      source: 'demo', currency: 'GNF',
      kpis: {
        users: seed.users.length, activeUsers: seed.users.filter((u) => u.status === 'active').length, newAccounts: seed.users.filter((u) => Date.now() - new Date(u.createdAt).getTime() < days * 86_400_000).length,
        publishedPages: seed.profiles.filter((p) => p.status === 'published').length, visits: sum('views'), clicks: sum('clicks'),
        subscriptions: seed.subscriptions.filter((s) => s.status === 'active').length, revenue: paid, reports: seed.reports.filter((x) => withOverrides(x).status === 'open').length, errors: rg.int(3, 40),
      },
      series, signups: series.map((p) => ({ date: p.date, value: rg.int(6, 28) })),
      categories: count(seed.users.map((u) => ({ n: u.category })), 'n'), plans: count(seed.users.map((u) => ({ n: u.plan })), 'n'),
    };
    return delay(out, 480);
  },

  async listUsers(q) {
    guard();
    const seed = getSeed();
    const st = readDb().userStatus;
    return delay(listFrom(seed.users.map((u) => ({ ...u, status: st[u.id] ?? u.status })), q, ['name', 'email', 'username', 'id']));
  },

  async getUser(id) {
    guard();
    const u = getSeed().users.find((x) => x.id === id);
    if (!u) throw new ApiError('not_found', 'user', { status: 404 });
    const status = readDb().userStatus[id] ?? u.status;
    const detail: AdminUserDetail = {
      ...u, status,
      history: [
        { at: u.lastActiveAt, event: 'Dernière activité', actor: u.name },
        { at: u.createdAt, event: u.emailVerified ? 'E-mail vérifié' : 'Vérification e-mail en attente', actor: 'Système' },
        { at: u.createdAt, event: 'Compte créé', actor: u.name },
      ],
    };
    return delay(detail);
  },

  async listProfiles(q) {
    guard();
    return delay(listFrom(getSeed().profiles, q, ['username', 'owner']));
  },

  async listReports(q) {
    guard();
    return delay(listFrom([...(readDb().reports ?? []), ...getSeed().reports].map(withOverrides), q, ['username', 'reporter', 'id']));
  },

  async getReport(id) {
    guard();
    const rep = [...(readDb().reports ?? []), ...getSeed().reports].find((r) => r.id === id);
    if (!rep) throw new ApiError('not_found', 'report', { status: 404 });
    return delay(withOverrides(rep));
  },

  async applyDecision(reportId, decision, note) {
    const actor = guard().name;
    const rep = [...(readDb().reports ?? []), ...getSeed().reports].find((r) => r.id === reportId);
    if (!rep) throw new ApiError('not_found', 'report', { status: 404 });
    await delay(null, 500);
    const labels = { dismiss: 'Signalement classé sans suite', warn: 'Avertissement préparé', suspend: 'Page suspendue', reinstate: 'Page réactivée' } as const;
    const owner = getSeed().users.find((u) => u.username === rep.username);
    writeDb((db) => {
      const cur = db.moderation[reportId] ?? { status: rep.status, history: [] };
      cur.status = decision === 'dismiss' ? 'dismissed' : 'resolved';
      cur.history.push({ at: new Date().toISOString(), event: `${labels[decision]}${note ? ` — ${note}` : ''}`, actor });
      db.moderation[reportId] = cur;
      if (owner && decision === 'suspend') db.userStatus[owner.id] = 'suspended';
      if (owner && decision === 'reinstate') db.userStatus[owner.id] = 'active';
    });
    // Enregistré localement uniquement : aucune action réelle n'a été transmise à un backend.
    return { mode: 'demo' as const, applied: false };
  },

  async setUserStatus(userId, status) {
    guard();
    await delay(null, 400);
    writeDb((db) => {
      db.userStatus[userId] = status;
    });
    return { mode: 'demo' as const, applied: false };
  },

  async listVerifications(q) {
    guard();
    return delay(listFrom(allVerifications(), q, ['username', 'owner', 'legalName', 'id']));
  },

  async decideVerification(id, decision, note) {
    guard();
    await delay(null, 450);
    const req = allVerifications().find((v) => v.id === id);
    if (!req) throw new ApiError('not_found', 'verification', { status: 404 });
    if (req.status !== 'pending') throw new ApiError('conflict', 'already_decided', { status: 409 });
    if (decision === 'reject' && note.trim().length < 5) throw new ApiError('validation', 'note_required', { status: 422 });
    const decided = { status: decision === 'approve' ? ('approved' as const) : ('rejected' as const), decidedAt: new Date().toISOString(), decisionNote: note.trim() || null };
    writeDb((db) => {
      db.verificationOverrides = { ...(db.verificationOverrides ?? {}), [id]: decided };
      const owner = db.users.find((u) => u.username === req.username);
      if (owner && decision === 'approve') {
        db.verifiedUsers = { ...(db.verifiedUsers ?? {}), [owner.id]: true };
        for (const store of [db.pages, db.published]) {
          const doc = store[owner.id];
          if (doc) store[owner.id] = { ...doc, blocks: doc.blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, verified: true } } : b)) };
        }
      }
    });
    return { mode: 'demo' as const, applied: false };
  },

  async listSubscriptions(q) {
    guard();
    return delay(listFrom(getSeed().subscriptions, q, ['user', 'id']));
  },
  async listPayments(q) {
    guard();
    return delay(listFrom(getSeed().payments, q, ['user', 'id']));
  },
  async listTickets(q) {
    guard();
    return delay(listFrom(getSeed().tickets, q, ['subject', 'user', 'id']));
  },
  async listAuditLogs(q) {
    guard();
    return delay(listFrom(getSeed().logs, q, ['actor', 'action', 'target', 'ip']));
  },
  async listSecurityEvents(q) {
    guard();
    return delay(listFrom(getSeed().security, q, ['subject', 'kind']));
  },

  async getRoleMatrix() {
    guard();
    return delay(DEMO_ROLE_PERMISSIONS, 120);
  },

  async getSystemStatus() {
    guard();
    const r = rng(77);
    const mk = (id: string, name: string, status: ServiceStatus['status'] = 'operational', note?: string): ServiceStatus => ({ id, name, status, latencyMs: status === 'unknown' ? null : r.int(18, 140), note });
    return delay([
      mk('api', 'API principale', 'unknown', 'Mode démonstration : aucun backend connecté'),
      mk('auth', 'Authentification'), mk('pages', 'Service de pages publiques'), mk('analytics', 'Collecte analytics'),
      mk('payments', 'Passerelle de paiement', 'unknown', 'Non connectée'), mk('storage', 'Stockage médias', 'degraded', 'Latence élevée (exemple)'),
      mk('queue', 'File de tâches'), mk('mail', 'E-mails transactionnels', 'unknown', 'Non connecté'),
    ]);
  },
};
