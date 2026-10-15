/**
 * Badges de profil, affichés à côté du nom sur la page publique. Règles (calculées par le SERVEUR, jamais acceptées du client) :
 *
 *  - `official` : compte super administrateur — le plus haut niveau, « Certifié 1Link » ;
 *  - `team`     : autre rôle d'administration (modération, support…) — « Équipe 1Link » ;
 *  - `verified` : profil vérifié après examen d'une demande (ou accordé par un administrateur) — implicite pour l'équipe ;
 *  - `business` : abonnement Business actif ;
 *  - `pro`      : abonnement Pro actif.
 *
 * Module partagé avec le serveur : doit rester une feuille (aucun import d'exécution).
 */
export const BADGE_IDS = ['official', 'team', 'verified', 'business', 'pro'] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export interface BadgeSubject {
  adminRole: string | null;
  verified: boolean;
  /** Offre EFFECTIVE (déjà ramenée à `free` quand l'abonnement n'est plus actif). */
  plan: string;
}

/** Badges mérités, du plus élevé au plus bas. */
export function badgesFor(s: BadgeSubject): BadgeId[] {
  const out: BadgeId[] = [];
  if (s.adminRole === 'super_admin') out.push('official');
  else if (s.adminRole) out.push('team');
  if (s.verified || s.adminRole) out.push('verified');
  if (s.plan === 'business') out.push('business');
  else if (s.plan === 'pro') out.push('pro');
  return out;
}

/** Les badges qui valent « profil vérifié » (coche historique). */
export const isVerifiedBy = (badges: readonly BadgeId[]): boolean => badges.some((b) => b === 'official' || b === 'team' || b === 'verified');
