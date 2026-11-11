/**
 * Appareils connus d'un compte. Un cookie d'appareil de longue durée (400 jours, `httpOnly`, dont seule l'empreinte SHA-256 est
 * stockée) permet de reconnaître un navigateur déjà utilisé. Quand une session s'ouvre depuis un appareil INCONNU alors que le
 * compte en avait déjà au moins un, un e-mail d'alerte part vers le titulaire : si ce n'est pas lui, il le voit tout de suite et
 * peut fermer la session depuis la page Sécurité.
 *
 * Aucune alerte pour le tout premier appareil (création du compte, ou premier passage d'un compte antérieur à cette fonction) :
 * il n'y a alors rien de « nouveau » à signaler. Le suivi ne fait jamais échouer une connexion.
 */
import { and, eq, sql } from 'drizzle-orm';
import { getCookie, setCookie } from 'hono/cookie';
import type { C, Deps, UserRow } from '../context.js';
import { userDevices } from '../db/schema.js';
import { securityEvent } from '../lib/audit.js';
import { newToken, sha256 } from '../lib/crypto.js';
import { describeRequest, newDeviceMessage } from '../lib/emails.js';
import { notify } from './notifications.js';

const COOKIE = 'onelink_device';
const DEVICE_COOKIE_DAYS = 400; // plafond appliqué par les navigateurs
const MAX_DEVICES = 20;

export interface DeviceCheck {
  known: boolean;
  /** Un e-mail d'alerte a été programmé. */
  alerted: boolean;
}

export async function recognizeDevice(c: C, deps: Deps, user: UserRow): Promise<DeviceCheck> {
  try {
    return await track(c, deps, user);
  } catch (e) {
    console.error('[devices] suivi de l’appareil impossible :', (e as Error).message);
    return { known: false, alerted: false };
  }
}

async function track(c: C, deps: Deps, user: UserRow): Promise<DeviceCheck> {
  const now = deps.now();
  const secure = deps.config.cookieSecure;
  const ctx = describeRequest(c.get('ua'), c.req.header('x-vercel-ip-country'));
  const label = [ctx.browser, ctx.os].filter(Boolean).join(' · ');

  const token = getCookie(c, COOKIE, secure ? 'host' : undefined);
  if (token && token.length <= 128) {
    const seen = await deps.db
      .update(userDevices)
      .set({ lastSeenAt: now, ...(label ? { label } : {}), country: ctx.country })
      .where(and(eq(userDevices.userId, user.id), eq(userDevices.deviceHash, sha256(token))))
      .returning({ h: userDevices.deviceHash });
    if (seen.length) return { known: true, alerted: false };
  }

  // Appareil inconnu : on le mémorise, puis on prévient le titulaire s'il en avait déjà un autre.
  const [before] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(userDevices).where(eq(userDevices.userId, user.id));
  const fresh = newToken();
  await deps.db.insert(userDevices).values({ userId: user.id, deviceHash: sha256(fresh), label, country: ctx.country, firstSeenAt: now, lastSeenAt: now }).onConflictDoNothing();
  await deps.db.execute(sql`
    delete from user_devices where user_id = ${user.id} and device_hash in (
      select device_hash from user_devices where user_id = ${user.id} order by last_seen_at desc offset ${MAX_DEVICES})`);
  setCookie(c, COOKIE, fresh, {
    httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: DEVICE_COOKIE_DAYS * 86_400,
    ...(secure ? { prefix: 'host' as const } : {}),
  });

  if (!before || before.n === 0) return { known: false, alerted: false };
  await securityEvent(deps.db, { kind: 'new_device', subject: `Connexion depuis un nouvel appareil (${label || 'inconnu'}${ctx.country ? `, ${ctx.country}` : ''})`, userId: user.id, ip: c.get('ip') }, now);
  notify(deps, user, (to, name, locale) => newDeviceMessage(to, name, ctx, now, `${deps.config.publicUrl}/dashboard/security`, locale));
  return { known: false, alerted: true };
}
