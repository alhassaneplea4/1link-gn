/** Jeux de données ADMIN fictifs, déterministes, générés à la volée. Jamais utilisés hors du mode démonstration. */
import type { VerificationRequest } from '@/models/verification';
import type { AdminProfileRow, AdminUserRow, AuditLog, PaymentRow, Report, ReportReason, SecurityEvent, SubscriptionRow, Ticket } from '@/models/admin';
import type { PlanId } from '@/models/auth';
import { CATEGORY_IDS } from '@/models/category';
import type { PageStatus } from '@/models/page';
import { rng } from './prng';

const FIRST = ['Mariama', 'Fatoumata', 'Aïssatou', 'Kadiatou', 'Hawa', 'Nènè', 'Mamadou', 'Ibrahima', 'Alpha', 'Sékou', 'Moussa', 'Ousmane', 'Thierno', 'Abdoulaye', 'Boubacar', 'Fanta', 'Djénabou', 'Salimatou', 'Mohamed', 'Amadou', 'Lansana', 'Mariam', 'Nafissatou', 'Saïdou', 'Younoussa'];
const LAST = ['Diallo', 'Camara', 'Bah', 'Barry', 'Sylla', 'Soumah', 'Keita', 'Traoré', 'Condé', 'Bangoura', 'Touré', 'Sow', 'Baldé', 'Kourouma', 'Fofana', 'Doumbouya', 'Cissé', 'Kaba'];
const COUNTRIES = ['Guinée', 'Guinée', 'Guinée', 'Guinée', 'Sénégal', 'Côte d’Ivoire', 'Mali', 'France', 'Sierra Leone'];

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();

export interface SeedUser extends AdminUserRow {
  country: string;
  blocksCount: number;
}

export interface SeedData {
  users: SeedUser[];
  profiles: AdminProfileRow[];
  reports: Report[];
  payments: PaymentRow[];
  subscriptions: SubscriptionRow[];
  tickets: Ticket[];
  logs: AuditLog[];
  security: SecurityEvent[];
  verifications: VerificationRequest[];
}

let cache: SeedData | null = null;

export function getSeed(): SeedData {
  if (cache) return cache;
  const r = rng(20260101);
  const users: SeedUser[] = [];
  for (let i = 0; i < 148; i++) {
    const first = r.pick(FIRST);
    const last = r.pick(LAST);
    const name = `${first} ${last}`;
    const hasPage = r.chance(0.82);
    const username = hasPage ? `${slug(first)}${r.chance(0.5) ? slug(last).slice(0, 4) : r.int(1, 99)}` : null;
    const plan: PlanId = r.pick(['free', 'free', 'free', 'free', 'pro', 'pro', 'business'] as PlanId[]);
    const status = r.chance(0.04) ? 'suspended' : r.chance(0.08) ? 'pending' : 'active';
    const pageStatus: PageStatus = !hasPage ? 'draft' : status === 'suspended' ? 'suspended' : r.chance(0.78) ? 'published' : 'draft';
    users.push({
      id: `usr_${String(1000 + i)}`, name, email: `${slug(first)}.${slug(last)}${i}@exemple.test`, username,
      category: r.pick(CATEGORY_IDS), plan, status, emailVerified: status !== 'pending', createdAt: ago(r.int(1, 240), r.int(0, 23)),
      lastActiveAt: ago(r.int(0, 30), r.int(0, 23)), pageStatus, views30d: pageStatus === 'published' ? r.int(0, 4200) : 0,
      country: r.pick(COUNTRIES), blocksCount: r.int(1, 14),
    });
  }
  const profiles: AdminProfileRow[] = users
    .filter((u) => u.username)
    .map((u, i) => ({
      id: `pg_${2000 + i}`, username: u.username!, owner: u.name, category: u.category, status: u.pageStatus, blocks: u.blocksCount,
      views30d: u.views30d, reports: r.chance(0.07) ? r.int(1, 4) : 0, updatedAt: u.lastActiveAt,
    }));

  const reasons: ReportReason[] = ['spam', 'impersonation', 'inappropriate', 'scam', 'copyright', 'other'];
  const excerpts: Record<ReportReason, string> = {
    spam: 'Lien répété vers une page de promotion sans rapport avec le profil.',
    impersonation: 'Le nom et la photo semblent imiter une personnalité connue.',
    inappropriate: 'Description jugée inappropriée par un visiteur.',
    scam: 'Offre « investissement garanti » avec un lien externe.',
    copyright: 'Images reprises d’un autre site sans mention.',
    other: 'Motif non précisé par le visiteur.',
  };
  const reports: Report[] = Array.from({ length: 42 }, (_, i) => {
    const p = r.pick(profiles);
    const reason = r.pick(reasons);
    const status = r.pick(['open', 'open', 'open', 'in_review', 'resolved', 'dismissed'] as const);
    return {
      id: `rep_${3000 + i}`, username: p.username, reason, status, priority: reason === 'scam' || reason === 'impersonation' ? 'high' : r.pick(['low', 'medium'] as const),
      reporter: r.chance(0.5) ? 'Visiteur anonyme' : `visiteur${r.int(100, 999)}@exemple.test`, details: excerpts[reason],
      createdAt: ago(r.int(0, 20), r.int(0, 23)), contentExcerpt: excerpts[reason],
      history: [{ at: ago(r.int(0, 20)), event: 'Signalement reçu', actor: 'Système' }],
    };
  });

  const methods = ['mobile_money', 'mobile_money', 'card', 'bank'] as const;
  const paying = users.filter((u) => u.plan !== 'free');
  const payments: PaymentRow[] = Array.from({ length: 96 }, (_, i) => {
    const u = r.pick(paying);
    return {
      id: `pay_${4000 + i}`, user: u.name, plan: u.plan, amount: u.plan === 'pro' ? 49_000 : 149_000, currency: 'GNF',
      status: r.pick(['paid', 'paid', 'paid', 'paid', 'pending', 'failed', 'refunded'] as const), method: r.pick(methods), date: ago(r.int(0, 90), r.int(0, 23)),
    };
  });
  const subscriptions: SubscriptionRow[] = paying.map((u, i) => ({
    id: `sub_${5000 + i}`, user: u.name, plan: u.plan, status: r.pick(['active', 'active', 'active', 'trialing', 'past_due', 'canceled'] as const),
    renewsAt: r.chance(0.9) ? ago(-r.int(1, 30)) : null, startedAt: ago(r.int(20, 200)),
  }));

  const subjects = ['Impossible de publier ma page', 'Changer mon pseudonyme', 'Question sur la facturation', 'Mon QR code ne s’affiche pas', 'Récupération de compte', 'Ajouter mon domaine'];
  const tickets: Ticket[] = Array.from({ length: 34 }, (_, i) => ({
    id: `tkt_${6000 + i}`, subject: r.pick(subjects), user: r.pick(users).name, status: r.pick(['open', 'open', 'pending', 'solved'] as const),
    priority: r.pick(['low', 'medium', 'medium', 'high'] as const), updatedAt: ago(r.int(0, 14), r.int(0, 23)),
  }));

  const actors = ['Sékou Condé', 'Nènè Traoré', 'Alpha Barry', 'Kadiatou Sylla', 'Hawa Bangoura', 'Système'];
  const actions = ['user.suspend', 'user.reinstate', 'report.dismiss', 'report.warn', 'plan.change', 'settings.update', 'role.assign', 'login.success', 'export.users'];
  const logs: AuditLog[] = Array.from({ length: 140 }, (_, i) => {
    const action = r.pick(actions);
    return {
      id: `log_${7000 + i}`, at: ago(r.int(0, 30), r.int(0, 23)), actor: r.pick(actors), action, target: r.pick(users).username ?? 'n/a',
      ip: `41.${r.int(60, 220)}.${r.int(0, 255)}.${r.int(1, 254)}`, level: (action.startsWith('role') || action === 'export.users' || action === 'user.suspend' ? 'warning' : 'info') as AuditLog['level'],
    };
  }).sort((a, b) => b.at.localeCompare(a.at));

  const kinds = ['failed_login', 'password_reset', 'role_change', 'suspicious_activity', 'new_device'] as const;
  const security: SecurityEvent[] = Array.from({ length: 48 }, (_, i) => {
    const kind = r.pick(kinds);
    return {
      id: `sec_${8000 + i}`, at: ago(r.int(0, 14), r.int(0, 23)), kind, subject: r.pick(users).email,
      level: (kind === 'suspicious_activity' ? 'critical' : kind === 'failed_login' || kind === 'role_change' ? 'warning' : 'info') as SecurityEvent['level'],
    };
  }).sort((a, b) => b.at.localeCompare(a.at));

  const verifKinds = ['person', 'business', 'organization'] as const;
  const verifications: VerificationRequest[] = Array.from({ length: 14 }, (_, i) => {
    const p = r.pick(profiles);
    const status = r.pick(['pending', 'pending', 'pending', 'approved', 'rejected'] as const);
    const kind = r.pick(verifKinds);
    return {
      id: `ver_${9000 + i}`, username: p.username, owner: p.owner, kind, legalName: kind === 'person' ? p.owner : `${p.owner.split(' ')[1] ?? 'Groupe'} ${kind === 'business' ? 'SARL' : 'Association'}`,
      registryNumber: kind === 'person' ? '' : `RCCM/GN/${r.int(2015, 2025)}/B/${r.int(1000, 9999)}`, proofUrl: `https://exemple.test/${p.username}`, note: '',
      status, createdAt: ago(r.int(0, 25), r.int(0, 23)), decidedAt: status === 'pending' ? null : ago(r.int(0, 5)), decisionNote: status === 'rejected' ? 'Les éléments fournis ne permettent pas de recouper l’identité.' : null,
    };
  });
  cache = { users, profiles, reports, payments, subscriptions, tickets, logs, security, verifications };
  return cache;
}
