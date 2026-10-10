/** Canaux proposés pour les liens de suivi. `poster` et `card` correspondent aux supports imprimables. */
export const TRACKING_SOURCES = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'email', 'poster', 'card'] as const;
export type TrackingSource = (typeof TRACKING_SOURCES)[number];

const SOURCE_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;

/** Nettoie un paramètre `src` reçu d'une URL (jamais de confiance) : minuscules, 24 caractères, alphanumérique. */
export function sanitizeSource(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  return SOURCE_RE.test(v) ? v : null;
}

/** Ajoute `?src=<canal>` à une adresse de page (en conservant les autres paramètres). */
export function trackedUrl(base: string, source: string): string {
  const url = new URL(base);
  url.searchParams.set('src', source);
  return url.toString();
}
