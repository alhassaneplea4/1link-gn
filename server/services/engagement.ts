/** Signalements de visiteurs et mesure d'audience (vues, clics) — sans cookie ni identifiant durable. */
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { C, Deps } from '../context.js';
import { pageEvents, pages, REPORT_REASONS, reports, users } from '../db/schema.js';
import { hmac, newId } from '../lib/crypto.js';
import { activity } from '../lib/audit.js';
import { badRequest, HttpError } from '../lib/errors.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { sanitizeSource } from '../../src/utilities/tracking.js';

export const reportInput = z.object({ reason: z.enum(REPORT_REASONS), details: z.string().trim().max(500).default('') });
export const eventInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('view'), source: z.string().max(40).nullish() }),
  z.object({ type: z.literal('click'), blockId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), source: z.string().max(40).nullish() }),
]);

export async function createReport(c: C, deps: Deps, username: string, input: z.infer<typeof reportInput>): Promise<void> {
  const now = deps.now();
  const key = username.trim().toLowerCase();
  const [page] = await deps.db.select({ id: pages.id, status: pages.status }).from(pages).where(eq(pages.username, key)).limit(1);
  if (!page || page.status !== 'published') throw new HttpError(404, 'not_found');
  const reporter = hmac(deps.config.secret, `reporter:${c.get('ip')}`);
  // Anti-abus : 3 signalements par page et par visiteur sur 24 h, 20 par visiteur au total.
  await enforce(deps.db, keyFor('report-page', reporter, page.id), 3, 86_400, now, 'too_many_reports');
  await enforce(deps.db, keyFor('report-all', reporter), 20, 86_400, now, 'too_many_reports');
  const [row] = await deps.db.select({ excerpt: pages.published }).from(pages).where(eq(pages.id, page.id)).limit(1);
  const profile = row?.excerpt?.blocks.find((b) => b.type === 'profile');
  const excerpt = (input.details || (profile?.type === 'profile' ? profile.data.headline || profile.data.displayName : '') || '—').slice(0, 300);
  await deps.db.insert(reports).values({
    id: newId('rep'), pageId: page.id, username: key, reason: input.reason, priority: input.reason === 'scam' || input.reason === 'impersonation' ? 'high' : 'medium',
    details: input.details, contentExcerpt: excerpt, reporterHash: reporter, createdAt: now, updatedAt: now,
    history: [{ at: now.toISOString(), event: 'Signalement reçu depuis la page publique', actor: 'Visiteur' }],
  });
  await activity(deps.db, 'report', key, now);
}

const BOT = /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|httpclient/i;

export const deviceOf = (ua: string): 'mobile' | 'tablet' | 'desktop' => (/ipad|tablet|kindle|silk/i.test(ua) ? 'tablet' : /mobi|android|iphone|ipod/i.test(ua) ? 'mobile' : 'desktop');

/**
 * Enregistre une vue ou un clic. Respecte « Ne pas me suivre » / Global Privacy Control, ignore les robots et le
 * propriétaire de la page. Le visiteur est une empreinte quotidienne non réversible (sel renouvelé chaque jour).
 */
export async function recordEvent(c: C, deps: Deps, username: string, input: z.infer<typeof eventInput>): Promise<void> {
  if (c.req.header('dnt') === '1' || c.req.header('sec-gpc') === '1') return;
  const ua = c.get('ua');
  if (!ua || BOT.test(ua)) return;
  const now = deps.now();
  const [row] = await deps.db
    .select({ id: pages.id, userId: pages.userId, status: pages.status, published: pages.published, userStatus: users.status })
    .from(pages)
    .innerJoin(users, eq(users.id, pages.userId))
    .where(eq(pages.username, username.trim().toLowerCase()))
    .limit(1);
  if (!row || row.status !== 'published' || row.userStatus !== 'active' || !row.published) return;
  const auth = c.get('auth');
  if (auth && auth.user.id === row.userId) return; // les visites du propriétaire ne comptent pas
  if (input.type === 'click' && !row.published.blocks.some((b) => b.id === input.blockId)) throw badRequest('unknown_block');

  const day = now.toISOString().slice(0, 10);
  const visitor = hmac(deps.config.secret, `visitor:${day}:${c.get('ip')}:${ua}`).slice(0, 24);
  await enforce(deps.db, keyFor('event', visitor, row.id), 300, 3600, now);
  await deps.db.insert(pageEvents).values({
    pageId: row.id, kind: input.type, blockId: input.type === 'click' ? input.blockId : null, source: sanitizeSource(input.source), device: deviceOf(ua),
    country: c.req.header('x-vercel-ip-country')?.toUpperCase().slice(0, 2) || null, visitor, at: now,
  });
}
