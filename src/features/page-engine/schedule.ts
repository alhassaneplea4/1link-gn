import type { AnyBlock, BlockSchedule } from '@/models/blocks';

export type ScheduleState = 'none' | 'upcoming' | 'active' | 'expired';

/** État d'un bloc vis-à-vis de sa programmation (heure du visiteur ; le serveur reste l'autorité en production). */
export function scheduleState(schedule: BlockSchedule | undefined, now: number): ScheduleState {
  if (!schedule || (!schedule.from && !schedule.until)) return 'none';
  const from = schedule.from ? Date.parse(schedule.from) : null;
  const until = schedule.until ? Date.parse(schedule.until) : null;
  if (from !== null && now < from) return 'upcoming';
  if (until !== null && now >= until) return 'expired';
  return 'active';
}

/** Un bloc est visible publiquement s'il est affiché ET dans sa fenêtre de programmation. */
export const isBlockLive = (block: AnyBlock, now: number): boolean => {
  if (!block.visible) return false;
  const s = scheduleState(block.schedule, now);
  return s === 'none' || s === 'active';
};

/** Une fenêtre inversée ou vide est invalide. */
export function scheduleError(schedule: BlockSchedule | undefined): 'invalid_range' | 'invalid_date' | null {
  if (!schedule) return null;
  const parsed = [schedule.from, schedule.until].map((v) => (v ? Date.parse(v) : null));
  if (parsed.some((v) => v !== null && Number.isNaN(v))) return 'invalid_date';
  const [from, until] = parsed;
  return from !== null && until !== null && until! <= from! ? 'invalid_range' : null;
}

/** ISO UTC → valeur d'un <input type="datetime-local"> (heure locale). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur d'un <input type="datetime-local"> (heure locale) → ISO UTC, ou null si vide / invalide. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Prochain instant où l'état d'un des blocs change (pour planifier le rafraîchissement), ou null. */
export function nextScheduleChange(blocks: readonly AnyBlock[], now: number): number | null {
  let next: number | null = null;
  for (const b of blocks) {
    for (const iso of [b.schedule?.from, b.schedule?.until]) {
      const t = iso ? Date.parse(iso) : NaN;
      if (!Number.isNaN(t) && t > now && (next === null || t < next)) next = t;
    }
  }
  return next;
}
