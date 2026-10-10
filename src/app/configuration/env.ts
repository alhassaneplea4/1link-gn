/** Configuration d'environnement : unique point de lecture des variables VITE_*. */
const apiBaseUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api').replace(/\/+$/, '');
const configuredDomain = (import.meta.env.VITE_PUBLIC_DOMAIN as string | undefined)?.trim() ?? '';

export const env = {
  /** Base de l'API : `/api` (même origine que l'interface, déploiement Vercel) par défaut. */
  apiBaseUrl,
  /** Flux temps réel (SSE) de l'Admin Center. */
  realtimeUrl: (import.meta.env.VITE_REALTIME_URL as string | undefined) ?? `${apiBaseUrl}/admin/realtime`,
  /** Domaine public des pages. Vide = le domaine sur lequel l'application est servie. */
  publicDomain: configuredDomain,
} as const;

const hostOf = () => (typeof window !== 'undefined' ? window.location.host : 'localhost');

/** Adresse affichée (sans protocole), toujours celle qui s'ouvre réellement. */
export const publicUrl = (username: string) => `${env.publicDomain || hostOf()}/${username}`;

/** Adresse réellement ouvrable (partage, QR code, impression). */
export const pageShareUrl = (username: string) => {
  if (env.publicDomain) return `https://${env.publicDomain}/${username}`;
  return typeof window !== 'undefined' ? `${window.location.origin}/${username}` : `https://localhost/${username}`;
};
