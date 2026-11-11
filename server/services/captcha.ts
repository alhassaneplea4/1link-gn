/**
 * Défi anti-robot ADAPTATIF : il n'apparaît qu'après des signes d'abus (échecs répétés, rafale de demandes depuis une même adresse
 * IP). Pas de verrouillage dur : un compte ne peut pas être bloqué par un tiers, il lui suffit de passer le défi.
 * Aucun effet sans clés Turnstile (`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`).
 */
import type { C, Deps } from '../context.js';
import { verifyTurnstile } from '../lib/captcha.js';
import { HttpError } from '../lib/errors.js';
import { keyFor, peek } from '../lib/ratelimit.js';

/** Seuils (fenêtre de 15 min pour le couple IP + adresse, d'une heure pour le reste). */
export const CAPTCHA_AFTER = { signInPairFailures: 3, signInIpFailures: 10, requestsPerIp: 6 } as const;

/** Vrai quand cette adresse IP (ou ce couple IP + adresse) a déjà enchaîné trop d'échecs de connexion. */
export async function signInNeedsCaptcha(deps: Deps, ip: string, email: string, now: Date): Promise<boolean> {
  const [pair, byIp] = await Promise.all([
    peek(deps.db, keyFor('signin-fail', ip, email), 900, now),
    peek(deps.db, keyFor('signin-fail-ip', ip), 3600, now),
  ]);
  return pair >= CAPTCHA_AFTER.signInPairFailures || byIp >= CAPTCHA_AFTER.signInIpFailures;
}

/** Vrai quand cette adresse IP a déjà demandé trop de codes / liens depuis une heure (`counterKey` : le compteur d'IP de la route). */
export async function requestsNeedCaptcha(deps: Deps, counterScope: 'mailcode-ip' | 'otp-ip' | 'forgot-ip', ip: string, now: Date): Promise<boolean> {
  return (await peek(deps.db, keyFor(counterScope, ip), 3600, now)) >= CAPTCHA_AFTER.requestsPerIp;
}

/** Exige un jeton valide quand `needed` ET que Turnstile est configuré ; sinon ne fait rien. */
export async function assertCaptcha(c: C, deps: Deps, needed: boolean, token: string | undefined): Promise<void> {
  const { captcha } = deps.config;
  if (!needed || !captcha.enabled) return;
  if (!token) throw new HttpError(403, 'captcha_required');
  const outcome = await verifyTurnstile(captcha.secret, token, c.get('ip'));
  if (outcome === 'failed') throw new HttpError(403, 'captcha_failed');
  if (outcome === 'unavailable') throw new HttpError(503, 'captcha_unavailable');
}
