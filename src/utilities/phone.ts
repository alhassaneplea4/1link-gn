/** Numéros de téléphone : normalisation E.164 et indicatifs pays proposés (Afrique francophone d'abord). */

export interface Country {
  /** Code région ISO 3166-1 alpha-2 (le nom est localisé via Intl.DisplayNames). */
  region: string;
  dial: string;
  /** Longueur du numéro national, si fixe (ex. Guinée = 9 chiffres). */
  nationalLength?: number;
}

export const COUNTRIES: readonly Country[] = [
  { region: 'GN', dial: '224', nationalLength: 9 },
  { region: 'SN', dial: '221', nationalLength: 9 },
  { region: 'CI', dial: '225', nationalLength: 10 },
  { region: 'ML', dial: '223', nationalLength: 8 },
  { region: 'BF', dial: '226', nationalLength: 8 },
  { region: 'NE', dial: '227', nationalLength: 8 },
  { region: 'TG', dial: '228', nationalLength: 8 },
  { region: 'BJ', dial: '229', nationalLength: 10 },
  { region: 'CM', dial: '237', nationalLength: 9 },
  { region: 'SL', dial: '232' },
  { region: 'LR', dial: '231' },
  { region: 'MR', dial: '222', nationalLength: 8 },
  { region: 'MA', dial: '212', nationalLength: 9 },
  { region: 'FR', dial: '33', nationalLength: 9 },
  { region: 'BE', dial: '32' },
  { region: 'CA', dial: '1', nationalLength: 10 },
];

export const DEFAULT_DIAL = '224';

export const countryByDial = (dial: string) => COUNTRIES.find((c) => c.dial === dial);

/** Nom localisé du pays. */
export function countryName(region: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(region) ?? region;
  } catch {
    return region;
  }
}

/**
 * Normalise une saisie en E.164 (`+224622000000`) ou retourne null si invalide.
 * - `+224 622 00 00 00` et `00224622000000` sont lus tels quels ;
 * - un numéro national (`622 00 00 00`, `0622000000`) reçoit l'indicatif `dial` (zéro de tête retiré).
 */
export function normalizePhone(raw: string, dial: string = DEFAULT_DIAL): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /[^\d\s().+-]/.test(trimmed)) return null;
  const digitsOnly = trimmed.replace(/\D/g, '');
  let full: string;
  if (trimmed.startsWith('+')) full = digitsOnly;
  else if (digitsOnly.startsWith('00')) full = digitsOnly.slice(2);
  else if (digitsOnly.startsWith(dial) && countryByDial(dial)?.nationalLength === digitsOnly.length - dial.length) full = digitsOnly; // indicatif saisi sans « + »
  else full = `${dial}${digitsOnly.replace(/^0+/, '')}`;
  if (full.length < 8 || full.length > 15 || full.startsWith('0')) return null;
  const country = COUNTRIES.filter((c) => full.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length)[0];
  if (country?.nationalLength && full.length - country.dial.length !== country.nationalLength) return null;
  return `+${full}`;
}

/** Affichage lisible : `+224 622 00 00 00` (groupes de 2 après les 3 premiers chiffres du national). */
export function formatInternational(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const country = COUNTRIES.filter((c) => digits.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length)[0];
  if (!country) return `+${digits}`;
  const national = digits.slice(country.dial.length);
  const head = national.slice(0, 3);
  const tail = national.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ');
  return `+${country.dial} ${head}${tail ? ` ${tail}` : ''}`;
}

/** Masque un numéro pour l'affichage de confirmation : `+224 6•• •• •• 00`. */
export function maskPhone(e164: string): string {
  const f = formatInternational(e164);
  const parts = f.split(' ');
  return parts.map((p, i) => (i === 0 ? p : i === parts.length - 1 ? p : p.replace(/\d/g, (d, j) => (i === 1 && j === 0 ? d : '•')))).join(' ');
}
