/** Pages : brouillon, publication, résolution publique, pseudonymes. */
import { and, eq, ne, sql } from 'drizzle-orm';
import type { AuthContext, Deps } from '../context.js';
import { pages, users, subscriptions, type PageContent } from '../db/schema.js';
import { newId } from '../lib/crypto.js';
import { activity } from '../lib/audit.js';
import { conflict, forbidden, HttpError, badRequest } from '../lib/errors.js';
import { entitlementsFor } from '../lib/access.js';
import { MAX_DOC_BYTES, type PageInput } from '../validation/page.js';
import { uniqueViolation } from './accounts.js';
import { RESERVED_USERNAMES, USERNAME_RE } from '../../src/utilities/validation.js';
import type { AnyBlock } from '../../src/models/blocks.js';
import type { CategoryId } from '../../src/models/category.js';
import type { PageDocument, PageStatus, PublicPageResult } from '../../src/models/page.js';
import type { PlanId } from '../../src/models/auth.js';

export type PageRow = typeof pages.$inferSelect;

export function usernameProblem(value: string): 'invalid' | 'reserved' | null {
  const v = value.trim().toLowerCase();
  if (!USERNAME_RE.test(v)) return 'invalid';
  if (RESERVED_USERNAMES.has(v)) return 'reserved';
  return null;
}

/** Le badge « vérifié » appartient au serveur : toute valeur envoyée par le client est écrasée. */
const withVerified = (blocks: AnyBlock[], verified: boolean): AnyBlock[] =>
  blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, verified } } : b));

const stamp = (blocks: AnyBlock[], now: string): AnyBlock[] => blocks.map((b) => (b.updatedAt ? b : { ...b, updatedAt: now }));

/** Document tel que le voit son propriétaire (brouillon courant). */
export function ownerDocument(row: PageRow, verified: boolean): PageDocument {
  const status: PageStatus = row.status === 'suspended' ? 'suspended' : row.published && row.status === 'published' ? 'published' : 'draft';
  return {
    id: row.id, username: row.username ?? '', category: row.draft.category as CategoryId, status, blocks: withVerified(row.draft.blocks, verified),
    appearance: row.draft.appearance, share: row.draft.share, version: row.version, updatedAt: row.updatedAt.toISOString(), publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

export async function getOwnerPage(deps: Deps, userId: string): Promise<PageRow | null> {
  const [row] = await deps.db.select().from(pages).where(eq(pages.userId, userId)).limit(1);
  return row ?? null;
}

function assertEntitlements(plan: PlanId, input: PageInput) {
  if (input.blocks.length > entitlementsFor(plan).maxBlocks) throw badRequest('plan_limit', { blocks: 'plan_limit' });
  if (Buffer.byteLength(JSON.stringify(input)) > MAX_DOC_BYTES) throw new HttpError(413, 'payload_too_large');
  const ids = new Set<string>();
  for (const b of input.blocks) {
    if (ids.has(b.id)) throw badRequest('duplicate_block', { blocks: 'duplicate_block' });
    ids.add(b.id);
  }
}

function assertUsername(input: PageInput, required: boolean) {
  if (!input.username) {
    if (required) throw badRequest('username_invalid', { username: 'invalid' });
    return;
  }
  const problem = usernameProblem(input.username);
  if (problem) throw badRequest(`username_${problem}`, { username: problem });
}

interface WriteOptions {
  publish: boolean;
}

/** Écrit le brouillon (et l'instantané publié si `publish`) avec verrou optimiste sur `version`. */
export async function writePage(deps: Deps, auth: AuthContext, input: PageInput, opts: WriteOptions): Promise<PageDocument> {
  assertEntitlements(auth.planId, input);
  assertUsername(input, opts.publish);
  const now = deps.now();
  const nowIso = now.toISOString();
  const verified = auth.user.verified;
  const blocks = stamp(withVerified(input.blocks as AnyBlock[], verified), nowIso);
  const content: PageContent = { blocks, appearance: input.appearance, share: input.share, category: input.category };

  try {
    const row = await deps.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(pages).where(eq(pages.userId, auth.user.id)).for('update').limit(1);
      if (existing?.status === 'suspended' && opts.publish) throw forbidden('page_suspended');
      const username = input.username || existing?.username || null;
      if (opts.publish && !username) throw badRequest('username_invalid', { username: 'invalid' });
      const snapshot: PageContent | null = opts.publish ? { ...content, blocks: content.blocks.filter((b) => b.visible) } : (existing?.published ?? null);

      let saved: PageRow;
      if (!existing) {
        if (input.version !== 0) throw conflict('version_conflict', { version: '0' });
        [saved] = await tx
          .insert(pages)
          .values({ id: newId('pg'), userId: auth.user.id, username, status: opts.publish ? 'published' : 'draft', draft: content, published: snapshot, version: 1, createdAt: now, updatedAt: now, publishedAt: opts.publish ? now : null })
          .returning();
      } else {
        if (input.version !== existing.version) throw conflict('version_conflict', { version: String(existing.version) });
        const status = existing.status === 'suspended' ? 'suspended' : opts.publish ? 'published' : existing.status;
        [saved] = await tx
          .update(pages)
          .set({ username, status, draft: content, published: snapshot, version: existing.version + 1, updatedAt: now, publishedAt: opts.publish ? now : existing.publishedAt })
          .where(and(eq(pages.id, existing.id), eq(pages.version, existing.version)))
          .returning();
        if (!saved) throw conflict('version_conflict');
      }
      await tx.update(users).set({ category: input.category, ...(opts.publish ? { onboardingDone: true } : {}), updatedAt: now }).where(eq(users.id, auth.user.id));
      if (opts.publish) await activity(tx, 'publish', username ?? auth.user.name, now);
      return saved!;
    });
    return ownerDocument(row, verified);
  } catch (e) {
    const constraint = uniqueViolation(e);
    if (constraint?.includes('username')) throw conflict('username_taken', { username: 'taken' });
    throw e;
  }
}

export async function unpublish(deps: Deps, auth: AuthContext): Promise<PageDocument> {
  const now = deps.now();
  const [row] = await deps.db
    .update(pages)
    .set({ status: 'draft', published: null, version: pagesVersionBump(), updatedAt: now, publishedAt: null })
    .where(and(eq(pages.userId, auth.user.id), ne(pages.status, 'suspended')))
    .returning();
  if (!row) {
    const existing = await getOwnerPage(deps, auth.user.id);
    if (existing?.status === 'suspended') throw forbidden('page_suspended');
    throw new HttpError(404, 'no_page');
  }
  return ownerDocument(row, auth.user.verified);
}

const pagesVersionBump = () => sql`${pages.version} + 1`;

/** Ce que voit un visiteur. Aucun champ privé du compte n'est exposé. */
export async function resolvePublicPage(deps: Deps, username: string): Promise<PublicPageResult> {
  const [row] = await deps.db
    .select({ p: pages, userStatus: users.status, verified: users.verified, planId: subscriptions.planId, subStatus: subscriptions.status })
    .from(pages)
    .innerJoin(users, eq(users.id, pages.userId))
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(eq(pages.username, username.trim().toLowerCase()))
    .limit(1);
  if (!row) return { state: 'not_found' };
  if (row.userStatus !== 'active' || row.p.status === 'suspended') return { state: 'suspended' };
  const snap = row.p.published;
  if (!snap || row.p.status !== 'published') return { state: 'draft' };
  const paid = row.subStatus === 'active' || row.subStatus === 'trialing' || row.subStatus === 'past_due';
  const plan = (paid ? row.planId : 'free') as PlanId;
  const page: PageDocument = {
    id: row.p.id, username: row.p.username ?? '', category: snap.category as CategoryId, status: 'published', blocks: withVerified(snap.blocks, row.verified),
    appearance: snap.appearance, share: snap.share, version: row.p.version, updatedAt: (row.p.publishedAt ?? row.p.updatedAt).toISOString(), publishedAt: row.p.publishedAt?.toISOString() ?? null,
  };
  return { state: 'published', page, branding: !entitlementsFor(plan).removeBranding };
}

export async function usernameAvailability(deps: Deps, username: string, selfUserId: string | null) {
  const v = username.trim().toLowerCase();
  const problem = usernameProblem(v);
  if (problem) return { available: false as const, reason: problem };
  const [owner] = await deps.db.select({ userId: pages.userId }).from(pages).where(eq(pages.username, v)).limit(1);
  if (owner && owner.userId !== selfUserId) return { available: false as const, reason: 'taken' as const };
  return { available: true as const };
}

