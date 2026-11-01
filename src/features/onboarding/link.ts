import { api } from '@/services/api';
import { validateUsername } from '@/utilities/validation';
import { usernameCandidates } from './compose';

/** État de l'adresse 1Link choisie : le serveur reste l'autorité sur la disponibilité. */
export type LinkStatus = 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid';

/** Vérifie une adresse : d'abord la règle locale (format, mots réservés), puis la disponibilité côté serveur. */
export async function checkLink(username: string): Promise<LinkStatus> {
  if (!username) return 'idle';
  const local = validateUsername(username);
  if (local) return local === 'common.validation.usernameReserved' ? 'reserved' : 'invalid';
  const r = await api.page.checkUsername(username).catch(() => null);
  if (!r) return 'idle';
  return r.available ? 'available' : r.reason === 'reserved' ? 'reserved' : r.reason === 'invalid' ? 'invalid' : 'taken';
}

/** Première adresse disponible parmi les candidates dérivées du nom (point de départ proposé à la personne). */
export async function pickUsername(displayName: string): Promise<string> {
  const candidates = usernameCandidates(displayName);
  for (const c of candidates) {
    const r = await api.page.checkUsername(c).catch(() => null);
    if (r?.available) return c;
  }
  return candidates[candidates.length - 1]!;
}
