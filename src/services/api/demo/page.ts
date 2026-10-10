import { ApiError } from '@/models/api';
import type { PageDocument, PublicPageResult } from '@/models/page';
import type { Report } from '@/models/admin';
import type { VerificationInput, VerificationRequest, VerificationState } from '@/models/verification';
import { isUrl } from '@/utilities/validation';
import { RESERVED_USERNAMES, USERNAME_RE } from '@/utilities/validation';
import type { PageApi } from '../types';
import { DEMO_ENTITLEMENTS } from './permissions';
import { delay, readDb, writeDb } from './db';
import { requireDemoUser } from './auth';
import { getSeed } from './seed';
import { getSampleDocument } from '@/features/page-engine/samples';

/** Pseudonymes de démonstration qui illustrent les états spéciaux de la page publique. */
const DEMO_STATES: Record<string, 'draft' | 'suspended' | 'unavailable'> = {
  'compte-suspendu': 'suspended',
  'brouillon-demo': 'draft',
  'indisponible-demo': 'unavailable',
};
const DEMO_TAKEN = new Set(['fatoumata', 'mamadou', 'kalou', 'fouta-solidaire', 'ibrahima', 'aissatou']);

function validateUsername(value: string, selfId: string): 'invalid' | 'reserved' | 'taken' | null {
  const v = value.trim().toLowerCase();
  if (!USERNAME_RE.test(v)) return 'invalid';
  if (RESERVED_USERNAMES.has(v)) return 'reserved';
  const owner = readDb().users.find((u) => u.username === v);
  if ((owner && owner.id !== selfId) || DEMO_TAKEN.has(v) || v in DEMO_STATES) return 'taken';
  return null;
}

/** Le badge « vérifié » appartient au serveur : toute valeur envoyée par le client est ignorée. */
function withServerVerified(doc: PageDocument, userId: string): PageDocument {
  const verified = readDb().verifiedUsers?.[userId] ?? false;
  return { ...doc, blocks: doc.blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, verified } } : b)) };
}

/** Demande courante d'un utilisateur, avec la décision de la modération appliquée. */
function currentVerification(userId: string): VerificationRequest | null {
  const db = readDb();
  const own = db.verifications?.[userId];
  return own ? { ...own, ...(db.verificationOverrides?.[own.id] ?? {}) } : null;
}

function checkEntitlements(userId: string, doc: PageDocument) {
  const user = readDb().users.find((u) => u.id === userId)!;
  const limit = DEMO_ENTITLEMENTS[user.plan].maxBlocks;
  if (doc.blocks.length > limit) throw new ApiError('validation', 'plan_limit', { status: 422, fields: { blocks: 'plan_limit' } });
}

export const demoPage: PageApi = {
  async getMyPage() {
    const u = requireDemoUser();
    const doc = readDb().pages[u.id];
    return delay(doc ? structuredClone({ ...doc, status: readDb().published[u.id] ? 'published' : 'draft' } as PageDocument) : null);
  },

  async saveDraft(doc) {
    const u = requireDemoUser();
    await delay(null, 380);
    const problem = doc.username ? validateUsername(doc.username, u.id) : null;
    if (problem) throw new ApiError('validation', `username_${problem}`, { status: 422, fields: { username: problem } });
    checkEntitlements(u.id, doc);
    const saved: PageDocument = withServerVerified({ ...doc, version: doc.version + 1, updatedAt: new Date().toISOString() }, u.id);
    writeDb((db) => {
      db.pages[u.id] = saved;
      const rec = db.users.find((x) => x.id === u.id);
      if (rec) {
        rec.username = saved.username || rec.username;
        rec.category = saved.category;
      }
    });
    return structuredClone({ ...saved, status: readDb().published[u.id] ? 'published' : 'draft' } as PageDocument);
  },

  async publish(doc) {
    const u = requireDemoUser();
    await delay(null, 520);
    if (!u.emailVerified && !u.phoneVerified) throw new ApiError('forbidden', 'email_not_verified', { status: 403 });
    const problem = validateUsername(doc.username, u.id);
    if (problem) throw new ApiError('validation', `username_${problem}`, { status: 422, fields: { username: problem } });
    checkEntitlements(u.id, doc);
    const now = new Date().toISOString();
    const page: PageDocument = withServerVerified({ ...doc, status: 'published', version: doc.version + 1, updatedAt: now, publishedAt: now }, u.id);
    writeDb((db) => {
      db.pages[u.id] = page;
      db.published[u.id] = structuredClone(page);
      const rec = db.users.find((x) => x.id === u.id);
      if (rec) {
        rec.username = page.username;
        rec.category = page.category;
        rec.onboardingDone = true;
      }
    });
    // Enregistré dans ce navigateur uniquement : aucune publication réelle n'a lieu.
    return { page: structuredClone(page), mode: 'demo' as const };
  },

  async unpublish() {
    const u = requireDemoUser();
    await delay(null, 300);
    writeDb((db) => {
      delete db.published[u.id];
    });
    const doc = readDb().pages[u.id]!;
    return structuredClone({ ...doc, status: 'draft' } as PageDocument);
  },

  async getPublicPage(username): Promise<PublicPageResult> {
    await delay(null, 160);
    const key = username.toLowerCase();
    const forced = DEMO_STATES[key];
    if (forced) {
      if (forced === 'unavailable') throw new ApiError('server', 'unavailable', { status: 503 });
      return { state: forced };
    }
    const db = readDb();
    const user = db.users.find((u) => u.username === key);
    if (!user) {
      // Pages fictives de l'Admin Center : rendues à partir d'un exemple pour que modération et profils soient explorables.
      const seeded = getSeed().profiles.find((p) => p.username === key);
      if (!seeded) return { state: 'not_found' };
      if (seeded.status !== 'published') return { state: seeded.status === 'suspended' ? 'suspended' : 'draft' };
      const sample = getSampleDocument(seeded.category);
      const blocks = sample.blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, displayName: seeded.owner } } : b));
      return { state: 'published', page: { ...sample, username: seeded.username, blocks }, branding: true };
    }
    if (db.userStatus[user.id] === 'suspended') return { state: 'suspended' };
    const snap = db.published[user.id];
    return snap ? { state: 'published', page: structuredClone(snap), branding: !DEMO_ENTITLEMENTS[user.plan].removeBranding } : { state: 'draft' };
  },

  async checkUsername(username) {
    const u = readDb().sessionUserId;
    await delay(null, 200);
    const problem = validateUsername(username, u ?? '');
    return problem ? { available: false, reason: problem } : { available: true };
  },

  async getVerification(): Promise<VerificationState> {
    const u = requireDemoUser();
    await delay(null, 150);
    const request = currentVerification(u.id);
    if (readDb().verifiedUsers?.[u.id]) return { status: 'approved', request };
    return { status: request?.status ?? 'none', request };
  },

  async requestVerification(input: VerificationInput): Promise<VerificationState> {
    const u = requireDemoUser();
    await delay(null, 350);
    if (!u.username) throw new ApiError('validation', 'no_page', { status: 422 });
    if (!input.attest || input.legalName.trim().length < 2 || !isUrl(input.proofUrl)) throw new ApiError('validation', 'invalid', { status: 422 });
    const current = currentVerification(u.id);
    if (current?.status === 'pending') throw new ApiError('conflict', 'already_pending', { status: 409 });
    if (readDb().verifiedUsers?.[u.id]) throw new ApiError('conflict', 'already_verified', { status: 409 });
    const request: VerificationRequest = {
      id: `ver_${Date.now().toString(36)}`, username: u.username, owner: u.name, kind: input.kind, legalName: input.legalName.trim(),
      registryNumber: input.registryNumber.trim(), proofUrl: input.proofUrl.trim(), note: input.note.trim(), status: 'pending',
      createdAt: new Date().toISOString(), decidedAt: null, decisionNote: null,
    };
    writeDb((db) => {
      db.verifications = { ...(db.verifications ?? {}), [u.id]: request };
    });
    return { status: 'pending', request };
  },

  async reportPage(username, input) {
    await delay(null, 300);
    const key = username.toLowerCase();
    if (input.details.length > 500) throw new ApiError('validation', 'details_too_long', { status: 422 });
    const existing = (readDb().reports ?? []).filter((r) => r.username === key);
    // Anti-abus (démo) : au plus 3 signalements par page et par navigateur.
    if (existing.length >= 3) throw new ApiError('rate_limited', 'too_many_reports', { status: 429 });
    const now = new Date().toISOString();
    const report: Report = {
      id: `rep_v${Date.now().toString(36)}`, username: key, reason: input.reason, status: 'open',
      priority: input.reason === 'scam' || input.reason === 'impersonation' ? 'high' : 'medium', reporter: 'Visiteur anonyme',
      details: input.details, contentExcerpt: input.details || '—', createdAt: now,
      history: [{ at: now, event: 'Signalement reçu depuis la page publique', actor: 'Visiteur' }],
    };
    writeDb((db) => {
      db.reports = [report, ...(db.reports ?? [])];
    });
    return { mode: 'demo' as const };
  },

  async trackEvent() {
    // Démonstration : aucun suivi. Les statistiques affichées sont générées localement et signalées comme telles.
  },
};
