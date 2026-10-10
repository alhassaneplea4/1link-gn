import type { DateRange, RangePreset } from '@/models/analytics';

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Construit une période (jours UTC inclus) à partir d'un préréglage. */
export function rangeFromPreset(preset: Exclude<RangePreset, 'custom'>, now = new Date()): DateRange {
  const to = isoDay(now);
  const days = preset === 'today' ? 1 : preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const from = isoDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  return { preset, from, to };
}

export function customRange(from: string, to: string): DateRange {
  return from <= to ? { preset: 'custom', from, to } : { preset: 'custom', from: to, to: from };
}

/** Nombre de jours couverts (inclus). */
export const rangeDays = (r: DateRange) => Math.round((new Date(r.to).getTime() - new Date(r.from).getTime()) / 86_400_000) + 1;
