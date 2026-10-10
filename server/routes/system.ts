import { Hono } from 'hono';
import { lt, sql } from 'drizzle-orm';
import type { HonoEnv } from '../context.js';
import { appErrors, authTokens, otpCodes, pageEvents, rateLimits, sessions } from '../db/schema.js';
import { forbidden, HttpError } from '../lib/errors.js';
import { safeEqual } from '../lib/crypto.js';

export const systemRoutes = new Hono<HonoEnv>();

/** Sonde de disponibilité (supervision, Vercel) : ne révèle ni configuration ni version détaillée. */
systemRoutes.get('/health', async (c) => {
  const { db, config } = c.get('deps');
  const t0 = performance.now();
  try {
    await db.execute(sql`select 1`);
  } catch {
    return c.json({ status: 'down' }, 503);
  }
  return c.json({ status: 'ok', db: Math.round(performance.now() - t0), commit: config.commit || undefined });
});

/**
 * Capacités réellement disponibles (aucun secret) : l'interface n'affiche que les canaux qui fonctionnent
 * (ex. pas de WhatsApp quand la passerelle SMS ne sait envoyer que des SMS).
 */
systemRoutes.get('/capabilities', (c) => {
  const { otp } = c.get('deps').config;
  const channels =
    otp.provider === 'sms8' ? ['sms'] : otp.provider === 'twilio' ? [...(otp.twilio.whatsappFrom || otp.twilio.messagingServiceSid ? ['whatsapp'] : []), ...(otp.twilio.smsFrom || otp.twilio.messagingServiceSid ? ['sms'] : [])] : otp.provider === 'dev' ? ['whatsapp', 'sms'] : [];
  return c.json({ otpChannels: channels, emailSending: c.get('deps').config.mail.provider !== 'none' });
});

/**
 * Maintenance planifiée (Vercel Cron) : purge ce qui n'a plus de raison d'être conservé (sessions et jetons expirés, codes,
 * compteurs de débit, événements d'audience au-delà de la rétention). Vercel envoie `Authorization: Bearer $CRON_SECRET`.
 */
systemRoutes.get('/cron/maintenance', async (c) => {
  const { db, config, now } = c.get('deps');
  const secret = config.cronSecret;
  const auth = c.req.header('authorization') ?? '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw forbidden('forbidden');
  const t = now();
  const day = 86_400_000;
  const ago = (ms: number) => new Date(t.getTime() - ms);
  const count = async (q: Promise<{ rowCount: number | null }>) => (await q).rowCount ?? 0;
  const purged = {
    sessions: await count(db.delete(sessions).where(lt(sessions.expiresAt, t)) as never),
    tokens: await count(db.delete(authTokens).where(lt(authTokens.expiresAt, ago(7 * day))) as never),
    otp: await count(db.delete(otpCodes).where(lt(otpCodes.createdAt, ago(day))) as never),
    rateLimits: await count(db.delete(rateLimits).where(lt(rateLimits.windowStart, ago(2 * day))) as never),
    events: await count(db.delete(pageEvents).where(lt(pageEvents.at, ago(config.retentionDays.events * day))) as never),
    errors: await count(db.delete(appErrors).where(lt(appErrors.at, ago(config.retentionDays.errors * day))) as never),
  };
  return c.json({ ok: true, purged });
});

/** Outils de test et de développement local (boîte d'envoi simulée). Désactivés en production par la configuration. */
export const devRoutes = new Hono<HonoEnv>();
devRoutes.get('/outbox', (c) => {
  const { mailer, otp, config } = c.get('deps');
  if (!config.devRoutes) throw new HttpError(404, 'not_found');
  const mails = (mailer as unknown as { outbox?: unknown[] }).outbox ?? [];
  const codes = (otp as unknown as { sent?: unknown[] }).sent ?? [];
  return c.json({ mails, codes });
});
