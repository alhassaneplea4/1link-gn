import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { HonoEnv } from '../context.js';
import { ROLE_PERMISSIONS } from '../lib/access.js';
import { badRequest } from '../lib/errors.js';
import { parseListQuery } from '../lib/lists.js';
import { readJson } from '../lib/request.js';
import { requireAnyPermission, requireAuth } from '../middleware.js';
import * as admin from '../services/admin.js';
import { platformOverview } from '../services/analytics.js';
import { decideVerification } from '../services/verification.js';
import type { RealtimeEvent } from '../../src/models/admin.js';
import type { Permission } from '../../src/models/auth.js';

export const adminRoutes = new Hono<HonoEnv>();
adminRoutes.use('*', requireAuth);

const can = (...p: Permission[]) => requireAnyPermission(...p);

adminRoutes.get('/overview', can('overview:read', 'analytics:read'), async (c) => {
  const url = new URL(c.req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw badRequest('invalid_range');
  return c.json(await platformOverview(c.get('deps'), { from, to }));
});

adminRoutes.get('/users', can('users:read'), async (c) => c.json(await admin.listUsers(c.get('deps'), parseListQuery(c))));
adminRoutes.get('/users/:id', can('users:read'), async (c) => c.json(await admin.getUserDetail(c.get('deps'), c.req.param('id'))));
adminRoutes.patch('/users/:id/status', can('users:write'), async (c) => {
  const body = await readJson(c, z.object({ status: z.enum(['active', 'suspended']) }));
  await admin.setUserStatus(c, c.get('deps'), c.get('auth')!, c.req.param('id'), body.status);
  return c.json({ applied: true });
});

adminRoutes.get('/profiles', can('profiles:read'), async (c) => c.json(await admin.listProfiles(c.get('deps'), parseListQuery(c))));

adminRoutes.get('/reports', can('reports:read', 'moderation:read'), async (c) => c.json(await admin.listReports(c.get('deps'), parseListQuery(c))));
adminRoutes.get('/reports/:id', can('reports:read', 'moderation:read'), async (c) => c.json(await admin.getReport(c.get('deps'), c.req.param('id'))));
adminRoutes.post('/reports/:id/decision', can('moderation:write', 'reports:write'), async (c) => {
  const body = await readJson(c, z.object({ decision: z.enum(['dismiss', 'warn', 'suspend', 'reinstate']), note: z.string().max(500).default('') }));
  await admin.applyDecision(c, c.get('deps'), c.get('auth')!, c.req.param('id'), body.decision, body.note);
  return c.json({ applied: true });
});

adminRoutes.get('/verifications', can('profiles:read', 'moderation:read'), async (c) => c.json(await admin.listVerifications(c.get('deps'), parseListQuery(c))));
adminRoutes.post('/verifications/:id/decision', can('moderation:write', 'profiles:write'), async (c) => {
  const body = await readJson(c, z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(500).default('') }));
  await decideVerification(c.get('deps'), c.get('auth')!, c.req.param('id'), body.decision, body.note);
  return c.json({ applied: true });
});

adminRoutes.get('/subscriptions', can('subscriptions:read'), async (c) => c.json(await admin.listSubscriptions(c.get('deps'), parseListQuery(c))));
adminRoutes.get('/payments', can('payments:read'), async (c) => c.json(await admin.listPayments(c.get('deps'), parseListQuery(c))));
adminRoutes.get('/tickets', can('support:read'), async (c) => c.json(await admin.listTickets(c.get('deps'), parseListQuery(c))));
adminRoutes.get('/logs', can('logs:read'), async (c) => c.json(await admin.listAuditLogs(c.get('deps'), parseListQuery(c))));
adminRoutes.get('/security/events', can('security:read'), async (c) => c.json(await admin.listSecurityEvents(c.get('deps'), parseListQuery(c))));
adminRoutes.get('/system/status', can('system:read'), async (c) => c.json(await admin.systemStatus(c.get('deps'))));
adminRoutes.get('/roles', can('settings:read', 'system:read', 'users:read'), (c) => c.json(ROLE_PERMISSIONS));

/**
 * Flux temps réel (SSE) : sur une fonction serverless, la connexion est volontairement bornée (~50 s) puis le navigateur
 * se reconnecte tout seul (EventSource) en reprenant au dernier identifiant reçu.
 */
adminRoutes.get('/realtime', can('realtime:read'), (c) => {
  const deps = c.get('deps');
  const lastId = Number(c.req.header('last-event-id') ?? 0) || 0;
  return streamSSE(c, async (stream) => {
    const max = async (table: 'activity_events' | 'page_events') => (await deps.db.execute<{ m: number }>(sql`select coalesce(max(id), 0)::int as m from ${sql.raw(table)}`)).rows[0]!.m;
    let actCursor = lastId ? lastId : await max('activity_events');
    let evCursor = lastId ? lastId : await max('page_events');
    const started = Date.now();
    await stream.writeSSE({ event: 'ready', data: '{}', retry: 3000 });
    while (!stream.aborted && Date.now() - started < 50_000) {
      const [act, ev, vis] = await Promise.all([
        deps.db.execute<{ id: number; at: Date; kind: RealtimeEvent['kind']; subject: string }>(sql`select id, at, kind, subject from activity_events where id > ${actCursor} order by id limit 50`),
        deps.db.execute<{ id: number; at: Date; kind: RealtimeEvent['kind']; username: string }>(sql`select e.id, e.at, e.kind, p.username from page_events e join pages p on p.id = e.page_id where e.id > ${evCursor} order by e.id limit 50`),
        deps.db.execute<{ n: number }>(sql`select count(distinct visitor)::int as n from page_events where at >= ${deps.now()}::timestamptz - interval '5 minutes'`),
      ]);
      for (const r of act.rows) {
        actCursor = Math.max(actCursor, r.id);
        await stream.writeSSE({ event: 'activity', data: JSON.stringify({ id: `act_${r.id}`, at: new Date(r.at).toISOString(), kind: r.kind, subject: r.subject } satisfies RealtimeEvent) });
      }
      for (const r of ev.rows) {
        evCursor = Math.max(evCursor, r.id);
        await stream.writeSSE({ event: 'activity', data: JSON.stringify({ id: `ev_${r.id}`, at: new Date(r.at).toISOString(), kind: r.kind, subject: `@${r.username}` } satisfies RealtimeEvent) });
      }
      await stream.writeSSE({ event: 'visitors', data: JSON.stringify({ count: vis.rows[0]?.n ?? 0 }) });
      await stream.sleep(3000);
    }
  });
});
