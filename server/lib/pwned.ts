/**
 * Mots de passe déjà compromis (API « Pwned Passwords » de Have I Been Pwned), par k-anonymat : seuls les 5 premiers caractères de
 * l'empreinte SHA-1 quittent le serveur, jamais le mot de passe ni son empreinte complète. L'API renvoie tous les suffixes qui
 * partagent ce préfixe ; la comparaison se fait ici. `Add-Padding` noie la taille réelle de la réponse parmi des lignes factices
 * (décompte 0), ignorées ci-dessous.
 *
 * La vérification est un garde-fou, pas une dépendance : si le service est injoignable ou lent, on répond `null` (inconnu) et
 * l'appelant ACCEPTE le mot de passe. Un service tiers ne doit jamais empêcher quelqu'un de réinitialiser son mot de passe.
 */
import { createHash } from 'node:crypto';

export const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2_500;

/** Nombre de fuites connues contenant ce mot de passe (`0` : aucune) ; `null` quand le service ne répond pas. */
export async function pwnedCount(password: string, opts: { timeoutMs?: number } = {}): Promise<number | null> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`${PWNED_RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': '1link-password-check' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
    if (!res.ok) return null;
    for (const line of (await res.text()).split('\n')) {
      const [candidate, count] = line.trim().split(':');
      if (candidate === suffix) return Number(count) || 0; // un décompte à 0 est une ligne de remplissage
    }
    return 0;
  } catch {
    return null;
  }
}
