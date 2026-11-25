import type { BeforeSendEvent } from '@vercel/analytics/react';

/**
 * Filtre appliqué à chaque événement avant son envoi à Vercel Web Analytics.
 * - Paramètres et ancre retirés : les liens e-mail (réinitialisation, vérification, suppression du compte) y portent un jeton.
 * - Code d'une carte physique (/c/…) masqué.
 * - Admin Center jamais mesuré (ses adresses contiennent des identifiants de comptes).
 * Les comparaisons ignorent la casse, comme le routeur.
 */
export function redactAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const { origin, pathname } = new URL(event.url);
  if (/^\/+admin(\/|$)/i.test(pathname)) return null;
  const path = /^\/+c\//i.test(pathname) ? '/c/[code]' : pathname;
  return { ...event, url: origin + path };
}
