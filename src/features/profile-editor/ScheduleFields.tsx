import { useId } from 'react';
import { Button, Icon } from '@/components/ui';
import { fromLocalInput, scheduleError, toLocalInput } from '@/features/page-engine/schedule';
import { useT } from '@/i18n/core';
import type { BlockSchedule } from '@/models/blocks';

/** Programmation d'un bloc : affichage à partir de / jusqu'à (heure locale du propriétaire). */
export function ScheduleFields({ schedule, onChange }: { schedule: BlockSchedule | undefined; onChange: (s: BlockSchedule | undefined) => void }) {
  const t = useT('editor');
  const base = useId();
  const error = scheduleError(schedule);
  const set = (key: 'from' | 'until', value: string) => {
    const next: BlockSchedule = { from: schedule?.from ?? null, until: schedule?.until ?? null, [key]: fromLocalInput(value) };
    onChange(next.from || next.until ? next : undefined);
  };
  return (
    <fieldset className="schedule">
      <legend className="field__label"><Icon name="calendar" size={16} /> {t('editor.schedule.title')}</legend>
      <p className="field__hint">{t('editor.schedule.hint')}</p>
      <div className="schedule__row">
        <label className="field" htmlFor={`${base}-from`}>
          <span className="field__label">{t('editor.schedule.from')}</span>
          <span className="control"><input id={`${base}-from`} type="datetime-local" className="control__input" value={toLocalInput(schedule?.from)} onChange={(e) => set('from', e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${base}-err` : undefined} /></span>
        </label>
        <label className="field" htmlFor={`${base}-until`}>
          <span className="field__label">{t('editor.schedule.until')}</span>
          <span className="control"><input id={`${base}-until`} type="datetime-local" className="control__input" value={toLocalInput(schedule?.until)} onChange={(e) => set('until', e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${base}-err` : undefined} /></span>
        </label>
      </div>
      {error && <p id={`${base}-err`} className="field__error" role="alert"><Icon name="alert-circle" size={14} /> {t(`editor.schedule.errors.${error}`)}</p>}
      {schedule && <Button size="sm" variant="ghost" iconLeft="x" onClick={() => onChange(undefined)}>{t('editor.schedule.clear')}</Button>}
    </fieldset>
  );
}
