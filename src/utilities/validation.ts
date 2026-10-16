/** Validateurs purs (retournent une clé de message d'erreur, ou null si valide). */

export type ValidationKey =
  | 'common.validation.required'
  | 'common.validation.email'
  | 'common.validation.url'
  | 'common.validation.phone'
  | 'common.validation.passwordShort'
  | 'common.validation.usernameFormat'
  | 'common.validation.usernameReserved'
  | 'common.validation.tooLong';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (v: string) => EMAIL_RE.test(v.trim());

export function isUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Lien de bouton : http(s), mailto: ou tel: (jamais javascript: ni data:). */
export function isLink(v: string): boolean {
  const value = v.trim();
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(value)) return true;
  if (/^tel:\+?[0-9][0-9\s().-]{3,}$/.test(value)) return true;
  return isUrl(value);
}

/** Téléphone au format international souple : + puis 6 à 15 chiffres (espaces tolérés). */
export const isPhone = (v: string) => /^\+?[0-9][0-9\s().-]{5,18}$/.test(v.trim());

export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$/;

/**
 * Pseudonymes interdits : routes de l'application et mots sensibles.
 * Toute nouvelle route de premier niveau DOIT être ajoutée ici pour éviter les collisions avec /:username.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'auth', 'api', 'app', 'dashboard', 'onboarding', 'features', 'pricing', 'faq', 'login', 'logout',
  'register', 'signup', 'signin', 'settings', 'support', 'help', 'about', 'contact', 'terms', 'privacy', 'legal',
  'static', 'assets', 'public', 'preview', '404', '403', 'status', 'blog', 'press', 'security', 'billing',
  '1link', 'onelink', 'root', 'sitemap', 'robots', 'manifest', 'delete-account', 'cookies', 'mentions', 'system', 'moderation', 'null', 'undefined', 'www', 'mail', 'demo', 'cgu',
]);

export function validateUsername(v: string): ValidationKey | null {
  const value = v.trim().toLowerCase();
  if (!value) return 'common.validation.required';
  if (!USERNAME_RE.test(value)) return 'common.validation.usernameFormat';
  if (RESERVED_USERNAMES.has(value)) return 'common.validation.usernameReserved';
  return null;
}

export const slugifyUsername = (v: string): string =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .slice(0, 30);

/** Nom provisoire tiré de l'adresse (« awa.diallo@… » → « Awa Diallo ») : la personne le complète à la configuration du profil. */
export function nameFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? '').replace(/[._-]+/g, ' ').replace(/\d+/g, ' ').trim();
  const words = local.split(/\s+/).filter(Boolean).slice(0, 3);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return (name || 'Nouveau membre').slice(0, 80);
}

/** Adresse partiellement masquée pour l'affichage (« a***@gmail.com »). */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(5, local.length - 1)))}@${domain}`;
}
