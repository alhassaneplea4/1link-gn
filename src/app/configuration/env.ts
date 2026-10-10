/** Configuration d'environnement : unique point de lecture des variables VITE_*. */
const mode = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'demo';

export const env = {
  /** `demo` : adaptateurs locaux explicitement signalés · `http` : API réelle. */
  apiMode: mode as 'demo' | 'http',
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1',
  realtimeUrl: (import.meta.env.VITE_REALTIME_URL as string | undefined) ?? '',
  publicDomain: (import.meta.env.VITE_PUBLIC_DOMAIN as string | undefined) ?? '1link.gn',
  isDemo: mode === 'demo',
} as const;

/** Adresse affichée (domaine configuré). */
export const publicUrl = (username: string) => `${env.publicDomain}/${username}`;

/** Adresse réellement ouvrable : en démonstration, la page est servie par cette application. */
export const pageShareUrl = (username: string) =>
  env.isDemo && typeof window !== 'undefined' ? `${window.location.origin}/${username}` : `https://${publicUrl(username)}`;
