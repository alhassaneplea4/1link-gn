import type { Executor } from '../db/client.js';
import { activityEvents, auditLogs, securityEvents } from '../db/schema.js';
import { newId } from './crypto.js';

type Level = 'info' | 'warning' | 'critical';

export async function audit(db: Executor, e: { actorId: string | null; actorLabel: string; action: string; target: string; ip: string | null; level?: Level }, at: Date) {
  await db.insert(auditLogs).values({ id: newId('aud'), at, actorId: e.actorId, actorLabel: e.actorLabel, action: e.action, target: e.target, ip: e.ip, level: e.level ?? 'info' });
}

export async function securityEvent(
  db: Executor,
  e: { kind: 'failed_login' | 'password_reset' | 'role_change' | 'suspicious_activity' | 'new_device'; subject: string; userId?: string | null; ip: string | null; level?: Level },
  at: Date,
) {
  await db.insert(securityEvents).values({ id: newId('sec'), at, kind: e.kind, subject: e.subject, userId: e.userId ?? null, ip: e.ip, level: e.level ?? 'info' });
}

export async function activity(db: Executor, kind: 'signup' | 'publish' | 'report', subject: string, at: Date) {
  await db.insert(activityEvents).values({ at, kind, subject });
}
