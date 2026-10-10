import { intlLocale } from '@/i18n/core';

/** Fuseau horaire d'affichage par défaut (marché initial : Guinée). Configurable par l'utilisateur plus tard. */
export const DEFAULT_TIMEZONE = 'Africa/Conakry';

/** Intl (fr) utilise des espaces fines insécables (U+202F) que beaucoup de polices ne dessinent pas : on les remplace par U+00A0. */
const NARROW_SPACES = /[  ]/g;
const nbsp = (s: string) => s.replace(NARROW_SPACES, ' ');

export const formatNumber = (value: number, opts?: Intl.NumberFormatOptions) => nbsp(new Intl.NumberFormat(intlLocale(), opts).format(value));

export const formatCompact = (value: number) => nbsp(new Intl.NumberFormat(intlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value));

export const formatPercent = (ratio: number, digits = 1) => nbsp(new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: digits }).format(ratio));

/** Montant dans la devise donnée (code ISO 4217). Les devises sans décimales (GNF, XOF) sont gérées par Intl. */
export function formatCurrency(amount: number, currency: string) {
  return nbsp(new Intl.NumberFormat(intlLocale(), { style: 'currency', currency, maximumFractionDigits: currency === 'GNF' || currency === 'XOF' ? 0 : 2 }).format(amount));
}

export function formatDate(value: string | number | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }, timeZone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat(intlLocale(), { timeZone, ...opts }).format(new Date(value));
}

export const formatDateTime = (value: string | number | Date) => formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });

export function formatRelative(value: string | number | Date, now = Date.now()) {
  const diff = new Date(value).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return rtf.format(0, 'second');
}
