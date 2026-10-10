/** Badge « Profil vérifié » : demande par l'utilisateur, décision par la modération. Le serveur est seul à pouvoir l'accorder. */
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthContext, Deps } from '../context.js';
import { pages, users, verifications } from '../db/schema.js';
import { newId } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { verificationDecisionMessage } from '../lib/emails.js';
import { notifyById } from './notifications.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { isUrl } from '../../src/utilities/validation.js';
import { VERIFICATION_KINDS, type VerificationDecision, type VerificationRequest, type VerificationState } from '../../src/models/verification.js';
import { uniqueViolation } from './accounts.js';

export const verificationInput = z.object({
  kind: z.enum(VERIFICATION_KINDS),
  legalName: z.string().trim().min(2).max(120),
  registryNumber: z.string().trim().max(60).default(''),
  proofUrl: z.string().trim().max(2048).refine(isUrl, 'url'),
  note: z.string().trim().max(500).default(''),
  attest: z.literal(true),
});

type Row = typeof verifications.$inferSelect;

/** Les requêtes SQL brutes renvoient les dates sous forme de texte : on accepte Date ou texte. */
const asIso = (d: Date | string) => new Date(d).toISOString();

export const toRequest = (r: Row, username: string, owner: string): VerificationRequest => ({
  id: r.id, username, owner, kind: r.kind as VerificationRequest['kind'], legalName: r.legalName, registryNumber: r.registryNumber, proofUrl: r.proofUrl, note: r.note,
  status: r.status as VerificationRequest['status'], createdAt: asIso(r.createdAt), decidedAt: r.decidedAt ? asIso(r.decidedAt) : null, decisionNote: r.decisionNote,
});

export async function getVerificationState(deps: Deps, auth: AuthContext): Promise<VerificationState> {
  const [latest] = await deps.db.select().from(verifications).where(eq(verifications.userId, auth.user.id)).orderBy(desc(verifications.createdAt)).limit(1);
  const request = latest ? toRequest(latest, auth.username ?? '', auth.user.name) : null;
  if (auth.user.verified) return { status: 'approved', request };
  return { status: request?.status ?? 'none', request };
}

export async function requestVerification(deps: Deps, auth: AuthContext, input: z.infer<typeof verificationInput>): Promise<VerificationState> {
  if (!auth.username) throw badRequest('no_page');
  if (auth.user.verified) throw conflict('already_verified');
  const now = deps.now();
  await enforce(deps.db, keyFor('verif-request', auth.user.id), 5, 30 * 86_400, now);
  try {
    await deps.db.insert(verifications).values({
      id: newId('ver'), userId: auth.user.id, kind: input.kind, legalName: input.legalName, registryNumber: input.registryNumber, proofUrl: input.proofUrl, note: input.note, createdAt: now,
    });
  } catch (e) {
    if (uniqueViolation(e)) throw conflict('already_pending'); // index unique partiel : une seule demande en attente
    throw e;
  }
  return getVerificationState(deps, auth);
}

export async function decideVerification(deps: Deps, actor: AuthContext, id: string, decision: VerificationDecision, note: string): Promise<void> {
  const now = deps.now();
  const trimmed = note.trim().slice(0, 500);
  if (decision === 'reject' && trimmed.length < 5) throw badRequest('note_required');
  let ownerId = '';
  await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(verifications).where(eq(verifications.id, id)).for('update').limit(1);
    if (!row) throw notFound('verification');
    if (row.status !== 'pending') throw conflict('already_decided');
    ownerId = row.userId;
    await tx.update(verifications).set({ status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: now, decisionNote: trimmed || null, decidedBy: actor.user.id }).where(eq(verifications.id, id));
    if (decision === 'approve') await tx.update(users).set({ verified: true, updatedAt: now }).where(eq(users.id, row.userId));
    const [page] = await tx.select({ username: pages.username }).from(pages).where(eq(pages.userId, row.userId)).limit(1);
    await audit(tx, { actorId: actor.user.id, actorLabel: actor.user.name, action: decision === 'approve' ? 'Profil vérifié' : 'Vérification refusée', target: page?.username ?? row.userId, ip: null }, now);
  });
  await notifyById(deps, ownerId, (to, name, locale) => verificationDecisionMessage(to, name, decision === 'approve', trimmed, locale));
}
