import type { MiddlewareHandler } from 'hono';
import type { Permission } from '../src/models/auth.js';
import type { HonoEnv } from './context.js';
import { forbidden, HttpError, unauthorized } from './lib/errors.js';
import { pickLocale } from './lib/emails.js';
import { newId } from './lib/crypto.js';
import { clientIp } from './lib/request.js';
import { permissionsFor } from './lib/access.js';
import { loadSession } from './services/sessions.js';

/** Contexte de requête + en-têtes de sécurité communs à toutes les réponses de l'API. */
export const baseMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.set('requestId', c.req.header('x-vercel-id') ?? newId('req'));
  c.set('ip', clientIp(c));
  c.set('ua', c.req.header('user-agent') ?? '');
  c.set('locale', pickLocale(c.req.header('accept-language')));
  c.set('auth', null);
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  c.header('X-Request-Id', c.get('requestId'));
  // Par défaut rien n'est mis en cache ; les routes publiques (page, médias) le surchargent explicitement.
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Défense CSRF en profondeur (en plus de `SameSite=Lax`) : une écriture doit provenir de l'origine de l'application.
 * Les clients non navigateur (curl, serveur à serveur) n'envoient pas `Origin` ni de cookie victime : ils ne sont pas concernés.
 */
export const originGuard: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const { config } = c.get('deps');
  const origin = c.req.header('origin');
  const site = c.req.header('sec-fetch-site');
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      throw forbidden('bad_origin');
    }
    const requestHost = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '';
    const ok = config.allowedOrigins.includes(origin.replace(/\/+$/, '')) || host === requestHost;
    if (!ok) throw forbidden('bad_origin');
  } else if (site === 'cross-site') throw forbidden('bad_origin');
  return next();
};

/** Charge la session si un cookie valide est présent (sans l'exiger). */
export const optionalAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!c.get('auth')) {
    const s = await loadSession(c, c.get('deps'));
    if (s) c.set('auth', s);
  }
  await next();
};

/** Exige une session valide. */
export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!c.get('auth')) {
    const s = await loadSession(c, c.get('deps'));
    if (!s) throw unauthorized('no_session');
    c.set('auth', s);
  }
  await next();
};

/** Exige l'une des permissions listées (le rôle est lu en base à chaque requête : une révocation est immédiate). */
export const requireAnyPermission = (...needed: Permission[]): MiddlewareHandler<HonoEnv> => async (c, next) => {
  const auth = c.get('auth');
  if (!auth) throw unauthorized('no_session');
  const have = permissionsFor(auth.user.adminRole as never);
  if (!needed.some((p) => have.includes(p))) throw new HttpError(403, 'forbidden');
  await next();
};
