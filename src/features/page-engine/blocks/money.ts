import { formatCurrency } from '@/utilities/format';

/**
 * Lit un prix saisi par un humain : « 150000 », « 150 000 », « 12,5 », « 12.50 ».
 * Retourne null si la saisie n'est pas un nombre positif ou nul. Une saisie vide n'est pas un prix.
 */
export function parsePrice(raw: string): number | null {
  const v = raw.replace(/[\s  ]/g, '');
  if (!v) return null;
  const normalized = /^\d+,\d{1,2}$/.test(v) ? v.replace(',', '.') : v.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Prix affichable : formaté dans la devise du vendeur, ou null si « sur demande ». */
export function formatPrice(raw: string, currency: string): string | null {
  const n = parsePrice(raw);
  return n === null ? null : formatCurrency(n, currency);
}

/** Taux saisi par le vendeur (> 0). */
export const parseRate = (raw: string): number | null => {
  const n = parsePrice(raw);
  return n !== null && n > 0 ? n : null;
};

/** Équivalent indicatif dans une autre devise, d'après le taux du vendeur (jamais un taux de marché). */
export function formatAltPrice(raw: string, rate: string | undefined, altCurrency: string): string | null {
  const price = parsePrice(raw);
  const r = rate ? parseRate(rate) : null;
  if (price === null || r === null) return null;
  return formatCurrency(price / r, altCurrency);
}
