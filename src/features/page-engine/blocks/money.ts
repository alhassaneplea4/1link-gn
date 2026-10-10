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
