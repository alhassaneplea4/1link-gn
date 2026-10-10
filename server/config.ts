/**
 * Configuration du serveur : unique point de lecture des variables d'environnement.
 * Toute valeur invalide ou manquante en production fait échouer le démarrage (échec rapide et explicite)
 * plutôt que de laisser tourner un serveur dans un état dangereux.
 */
import { COUNTRIES } from '../src/utilities/phone.js';

export type AppEnv = 'production' | 'preview' | 'development' | 'test';
export type MailProvider = 'smtp' | 'resend' | 'dev' | 'none';
export type OtpProvider = 'sms8' | 'twilio' | 'dev' | 'none';

export interface AppConfig {
  appEnv: AppEnv;
  /** Vrai pour la production ET les déploiements de prévisualisation : mêmes exigences de sécurité. */
  hardened: boolean;
  databaseUrl: string;
  poolMax: number;
  /** Secret serveur : HMAC des codes OTP, des identifiants de visiteurs. 32 caractères minimum. */
  secret: string;
  publicUrl: string;
  /** Origines autorisées à émettre des requêtes d'écriture (en plus de l'origine de la requête elle-même). */
  allowedOrigins: string[];
  cookieSecure: boolean;
  sessionDays: number;
  adminSessionHours: number;
  /** Coût scrypt (log2 de N). */
  scryptLog2N: number;
  mail: { provider: MailProvider; from: string; resendKey: string; smtp: { host: string; port: number; secure: boolean; user: string; pass: string } };
  otp: {
    provider: OtpProvider;
    allowedDialCodes: string[];
    /** Passerelle SMS8.io : les SMS partent depuis un téléphone Android appairé (SMS uniquement, pas de WhatsApp). */
    sms8: { apiKey: string; baseUrl: string; devices: string; option: number };
    twilio: { sid: string; token: string; smsFrom: string; whatsappFrom: string; whatsappContentSid: string; messagingServiceSid: string };
  };
  cronSecret: string;
  /** Routes réservées aux tests et à l'outillage local (jamais actives en production). */
  devRoutes: boolean;
  /** Multiplie les plafonds de débit (e2e UNIQUEMENT : tous les navigateurs de test partagent une adresse IP). Toujours 1 en production. */
  rateLimitScale: number;
  retentionDays: { events: number; errors: number };
  commit: string;
}

type Source = Record<string, string | undefined>;

const trim = (v: string | undefined) => (v ?? '').trim();

export function loadConfig(env: Source = process.env, overrides: Partial<AppConfig> = {}): AppConfig {
  const vercelEnv = trim(env.VERCEL_ENV);
  const nodeEnv = trim(env.NODE_ENV);
  const appEnv: AppEnv =
    vercelEnv === 'production' ? 'production' : vercelEnv === 'preview' ? 'preview' : nodeEnv === 'production' ? 'production' : nodeEnv === 'test' ? 'test' : 'development';
  const hardened = appEnv === 'production' || appEnv === 'preview';
  const problems: string[] = [];

  const databaseUrl = trim(env.DATABASE_URL);
  if (!databaseUrl) problems.push('DATABASE_URL est obligatoire.');

  let secret = trim(env.APP_SECRET);
  if (!secret) {
    if (hardened) problems.push('APP_SECRET est obligatoire (32 caractères minimum, ex. `openssl rand -base64 48`).');
    else secret = 'dev-only-secret-do-not-use-in-production-0123456789';
  } else if (secret.length < 32) problems.push('APP_SECRET doit contenir au moins 32 caractères.');

  const vercelHost = trim(env.VERCEL_PROJECT_PRODUCTION_URL) || trim(env.VERCEL_URL);
  const publicUrl = (trim(env.APP_URL) || (vercelHost ? `https://${vercelHost}` : 'http://localhost:5173')).replace(/\/+$/, '');
  const allowedOrigins = [publicUrl, ...trim(env.ALLOWED_ORIGINS).split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)];
  if (trim(env.VERCEL_URL)) allowedOrigins.push(`https://${trim(env.VERCEL_URL)}`);
  if (trim(env.VERCEL_BRANCH_URL)) allowedOrigins.push(`https://${trim(env.VERCEL_BRANCH_URL)}`);

  const resendKey = trim(env.RESEND_API_KEY);
  const smtpUser = trim(env.SMTP_USER);
  const smtpPass = trim(env.SMTP_PASS).replace(/\s+/g, ''); // les mots de passe d'application Google s'affichent en groupes séparés par des espaces
  const smtpPort = Number(trim(env.SMTP_PORT) || 465);
  const mailChoice = trim(env.MAIL_PROVIDER) || (smtpUser && smtpPass ? 'smtp' : resendKey ? 'resend' : hardened ? 'none' : 'dev');
  if (!['smtp', 'resend', 'dev', 'none'].includes(mailChoice)) problems.push('MAIL_PROVIDER doit valoir smtp, resend, dev ou none.');
  if (mailChoice === 'smtp' && !(smtpUser && smtpPass)) problems.push('SMTP_USER et SMTP_PASS sont requis quand MAIL_PROVIDER=smtp.');
  if (mailChoice === 'resend' && !resendKey) problems.push('RESEND_API_KEY est requis quand MAIL_PROVIDER=resend.');
  if (mailChoice === 'dev' && hardened) problems.push('MAIL_PROVIDER=dev est interdit en production et prévisualisation.');

  const tw = {
    sid: trim(env.TWILIO_ACCOUNT_SID), token: trim(env.TWILIO_AUTH_TOKEN), smsFrom: trim(env.TWILIO_SMS_FROM),
    whatsappFrom: trim(env.TWILIO_WHATSAPP_FROM), whatsappContentSid: trim(env.TWILIO_WHATSAPP_CONTENT_SID), messagingServiceSid: trim(env.TWILIO_MESSAGING_SERVICE_SID),
  };
  const sms8 = { apiKey: trim(env.SMS8_API_KEY), baseUrl: (trim(env.SMS8_BASE_URL) || 'https://app.sms8.io').replace(/\/+$/, ''), devices: trim(env.SMS8_DEVICES), option: Number(trim(env.SMS8_OPTION) || 0) };
  const otpChoice = trim(env.OTP_PROVIDER) || (sms8.apiKey ? 'sms8' : tw.sid && tw.token ? 'twilio' : hardened ? 'none' : 'dev');
  if (!['sms8', 'twilio', 'dev', 'none'].includes(otpChoice)) problems.push('OTP_PROVIDER doit valoir sms8, twilio, dev ou none.');
  if (otpChoice === 'sms8' && !sms8.apiKey) problems.push('SMS8_API_KEY est requis quand OTP_PROVIDER=sms8.');
  if (otpChoice === 'sms8' && !sms8.baseUrl.startsWith('https://')) problems.push('SMS8_BASE_URL doit être en https.');
  if (otpChoice === 'twilio' && !(tw.sid && tw.token)) problems.push('TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN sont requis quand OTP_PROVIDER=twilio.');
  if (otpChoice === 'dev' && hardened) problems.push('OTP_PROVIDER=dev est interdit en production et prévisualisation.');

  const dials = trim(env.OTP_ALLOWED_DIAL_CODES);
  const allowedDialCodes = dials ? dials.split(',').map((d) => d.trim()).filter(Boolean) : COUNTRIES.map((c) => c.dial);

  const devRoutes = trim(env.ENABLE_DEV_ROUTES) === '1';
  if (devRoutes && hardened) problems.push('ENABLE_DEV_ROUTES=1 est interdit en production et prévisualisation.');
  const rateLimitScale = Number(trim(env.RATE_LIMIT_SCALE) || 1);
  if (!(rateLimitScale >= 1)) problems.push('RATE_LIMIT_SCALE doit être un nombre ≥ 1.');
  if (rateLimitScale !== 1 && hardened) problems.push('RATE_LIMIT_SCALE est interdit en production et prévisualisation.');

  if (problems.length) throw new Error(`Configuration invalide :\n- ${problems.join('\n- ')}`);

  const num = (v: string | undefined, d: number) => {
    const n = Number(trim(v));
    return Number.isFinite(n) && n > 0 ? n : d;
  };

  return {
    appEnv, hardened, databaseUrl, secret, publicUrl, allowedOrigins,
    poolMax: num(env.DATABASE_POOL_MAX, hardened ? 3 : 5),
    cookieSecure: hardened || publicUrl.startsWith('https://'),
    sessionDays: num(env.SESSION_DAYS, 30),
    adminSessionHours: num(env.ADMIN_SESSION_HOURS, 12),
    scryptLog2N: num(env.SCRYPT_LOG2_N, appEnv === 'test' ? 10 : 15),
    mail: {
      provider: mailChoice as MailProvider,
      // Gmail impose l'adresse authentifiée comme expéditeur : on n'y met que le nom affiché.
      from: trim(env.MAIL_FROM) || (mailChoice === 'smtp' ? '1Link <' + smtpUser + '>' : '1Link <no-reply@1link.gn>'),
      resendKey,
      smtp: { host: trim(env.SMTP_HOST) || 'smtp.gmail.com', port: smtpPort, secure: trim(env.SMTP_SECURE) ? trim(env.SMTP_SECURE) !== '0' : smtpPort === 465, user: smtpUser, pass: smtpPass },
    },
    otp: { provider: otpChoice as OtpProvider, allowedDialCodes, sms8, twilio: tw },
    cronSecret: trim(env.CRON_SECRET),
    devRoutes, rateLimitScale,
    retentionDays: { events: num(env.RETENTION_EVENTS_DAYS, 400), errors: num(env.RETENTION_ERRORS_DAYS, 90) },
    commit: trim(env.VERCEL_GIT_COMMIT_SHA).slice(0, 7),
    ...overrides,
  };
}
