/**
 * Base de données de DÉMONSTRATION, locale à ce navigateur (localStorage).
 * Isolée de tout service de production : seuls les adaptateurs de ce dossier l'utilisent.
 * Aucun mot de passe n'est stocké ni vérifié en mode démonstration.
 */
import type { AdminRole, PlanId } from '@/models/auth';
import type { CategoryId } from '@/models/category';
import type { PageDocument } from '@/models/page';
import type { Subscription } from '@/models/billing';
import type { Report, ReportStatus } from '@/models/admin';
import type { VerificationRequest } from '@/models/verification';
import { safeStorage } from '@/utilities/storage';
import { getSampleDocument } from '@/features/page-engine/samples';

export interface DemoUserRecord {
  id: string;
  email: string | null;
  phone?: string | null;
  name: string;
  emailVerified: boolean;
  phoneVerified?: boolean;
  category: CategoryId | null;
  onboardingDone: boolean;
  username: string | null;
  plan: PlanId;
  adminRole: AdminRole | null;
  createdAt: string;
}

export interface DemoDb {
  v: 1;
  users: DemoUserRecord[];
  /** Brouillon courant de chaque utilisateur. */
  pages: Record<string, PageDocument>;
  /** Dernière version publiée (ce que voient les visiteurs). */
  published: Record<string, PageDocument>;
  subscriptions: Record<string, Subscription>;
  sessionUserId: string | null;
  sessionExpiresAt: string | null;
  moderation: Record<string, { status: ReportStatus; history: { at: string; event: string; actor: string }[] }>;
  userStatus: Record<string, 'active' | 'suspended'>;
  /** Signalements envoyés depuis les pages publiques de ce navigateur (démonstration). */
  reports?: Report[];
  /** Demande de vérification de chaque utilisateur (démonstration). */
  verifications?: Record<string, VerificationRequest>;
  /** Badge « vérifié » accordé par la modération : seule source de vérité du badge. */
  verifiedUsers?: Record<string, boolean>;
  /** Décisions prises sur les demandes fictives de l'Admin Center. */
  verificationOverrides?: Record<string, Pick<VerificationRequest, 'status' | 'decidedAt' | 'decisionNote'>>;
}

const KEY = 'onelink.demo.db.v1';
const D = (iso: string) => iso;

export interface Persona {
  id: string;
  email: string;
  name: string;
  label: string;
  description: string;
  adminRole: AdminRole | null;
  category: CategoryId;
  plan: PlanId;
  username: string;
}

export const PERSONAS: Persona[] = [
  { id: 'u_mariama', email: 'mariama@demo.1link', name: 'Mariama Bah', label: 'Créatrice · Pro', description: 'Utilisatrice avec une page publiée', adminRole: null, category: 'creator', plan: 'pro', username: 'mariama' },
  { id: 'u_super', email: 'superadmin@demo.1link', name: 'Sékou Condé', label: 'Super Admin', description: 'Toutes les permissions', adminRole: 'super_admin', category: 'professional', plan: 'business', username: 'staff-sekou' },
  { id: 'u_admin', email: 'admin@demo.1link', name: 'Nènè Traoré', label: 'Admin', description: 'Gestion sans paramètres sensibles', adminRole: 'admin', category: 'professional', plan: 'business', username: 'staff-nene' },
  { id: 'u_mod', email: 'moderator@demo.1link', name: 'Alpha Barry', label: 'Moderator', description: 'Signalements et modération', adminRole: 'moderator', category: 'individual', plan: 'free', username: 'staff-alpha' },
  { id: 'u_support', email: 'support@demo.1link', name: 'Kadiatou Sylla', label: 'Support', description: 'Assistance utilisateurs', adminRole: 'support', category: 'individual', plan: 'free', username: 'staff-kadiatou' },
  { id: 'u_analyst', email: 'analyst@demo.1link', name: 'Moussa Camara', label: 'Analyst', description: 'Lecture des statistiques', adminRole: 'analyst', category: 'professional', plan: 'free', username: 'staff-moussa' },
  { id: 'u_finance', email: 'finance@demo.1link', name: 'Hawa Bangoura', label: 'Finance', description: 'Paiements et abonnements', adminRole: 'finance', category: 'professional', plan: 'free', username: 'staff-hawa' },
];

function seed(): DemoDb {
  const users: DemoUserRecord[] = PERSONAS.map((p) => ({
    id: p.id, email: p.email, name: p.name, emailVerified: true, category: p.category, onboardingDone: true,
    username: p.username, plan: p.plan, adminRole: p.adminRole, createdAt: D('2026-03-01T09:00:00.000Z'),
  }));
  const pages: DemoDb['pages'] = {};
  for (const p of PERSONAS) {
    const doc = getSampleDocument(p.category);
    pages[p.id] = {
      ...doc, id: `page_${p.id}`, username: p.username,
      blocks: doc.blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, displayName: p.name } } : b)),
    };
  }
  const published: DemoDb['published'] = {};
  for (const [id, doc] of Object.entries(pages)) published[id] = structuredClone(doc);
  return {
    v: 1, users, pages, published,
    subscriptions: {
      u_mariama: { planId: 'pro', status: 'active', period: 'monthly', renewsAt: '2026-11-02T00:00:00.000Z', cancelAtPeriodEnd: false },
    },
    sessionUserId: null, sessionExpiresAt: null, moderation: {}, userStatus: {},
  };
}

let cache: DemoDb | null = null;

export function readDb(): DemoDb {
  if (cache) return cache;
  const stored = safeStorage.getJSON<DemoDb>(KEY);
  cache = stored && stored.v === 1 ? stored : seed();
  return cache;
}

export function writeDb(mutate: (db: DemoDb) => void): DemoDb {
  const db = readDb();
  mutate(db);
  safeStorage.setJSON(KEY, db);
  return db;
}

/** Réinitialise les données de démonstration (utilisé par les tests). */
export function resetDemoDb() {
  cache = null;
  safeStorage.remove(KEY);
}

/** Latence simulée (réglable : les tests la mettent à 0). */
export const latency = { ms: 220 };
export const delay = <T,>(value: T, ms = latency.ms): Promise<T> => new Promise((r) => setTimeout(() => r(value), ms));
