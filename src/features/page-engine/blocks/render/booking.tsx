import { useId, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import { formatDate } from '@/utilities/format';
import type { BlockRenderProps } from '../types';
import { BOOKING_SLOTS, bookingHref, buildBookingMessage, todayLocal, validateBooking, type BookingErrors, type BookingRequest } from '../booking';

const EMPTY: BookingRequest = { name: '', service: '', date: '', slot: 'any', message: '' };

/**
 * Demande de rendez-vous : le visiteur remplit un court formulaire, puis envoie le message lui-même sur WhatsApp.
 * 1Link ne reçoit ni ne conserve aucune information du visiteur.
 */
export function BookingRender({ block, ctx }: BlockRenderProps<'booking'>) {
  const t = useT('pub');
  const base = useId();
  const { title, phone, availability, services, note } = block.data;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BookingRequest>(EMPTY);
  const [errors, setErrors] = useState<BookingErrors>({});
  const set = <K extends keyof BookingRequest>(k: K, v: BookingRequest[K]) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: keyof BookingErrors) => (errors[k] ? t(`pub.booking.errors.${errors[k]!}`) : undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ctx.preview) return;
    const found = validateBooking(form, todayLocal());
    setErrors(found);
    if (Object.keys(found).length) return;
    const message = buildBookingMessage(form, {
      intro: ({ name }) => t('pub.booking.message.intro', { name }),
      service: (s) => t('pub.booking.message.service', { service: s }),
      date: (d) => t('pub.booking.message.date', { date: formatDate(`${d}T12:00:00`, { dateStyle: 'full' }, 'UTC') }),
      slot: (s) => t('pub.booking.message.slot', { slot: t(`pub.booking.slots.${s}`) }),
      note: (m) => t('pub.booking.message.note', { message: m }),
    });
    ctx.onTrack?.(block.id);
    window.open(bookingHref(phone, message), '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="pg-card pg-booking">
      <h2 className="pg-h2">{title || t('pub.booking.title')}</h2>
      {availability && <p className="pg-booking__avail"><Icon name="clock" size={14} /> {availability}</p>}
      <button type="button" className="pg-btn pg-booking__toggle" aria-expanded={open} aria-controls={`${base}-form`} onClick={() => setOpen((o) => !o)}>
        <span className="pg-btn__icon"><Icon name="calendar" size={20} /></span>
        <span className="pg-btn__body"><span className="pg-btn__title">{t('pub.booking.cta')}</span></span>
        <Icon name="chevron-down" size={16} className="pg-btn__arrow" />
      </button>
      {open && (
        <form id={`${base}-form`} className="pg-form" onSubmit={submit} noValidate>
          <label className="pg-field">
            <span>{t('pub.booking.name')} *</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" aria-invalid={errors.name ? true : undefined} required />
            {err('name') && <small className="pg-field__err" role="alert">{err('name')}</small>}
          </label>
          {services.length > 0 && (
            <label className="pg-field">
              <span>{t('pub.booking.service')}</span>
              <select value={form.service} onChange={(e) => set('service', e.target.value)}>
                <option value="">{t('pub.booking.anyService')}</option>
                {services.map((s, i) => <option key={i} value={s.name}>{s.name}</option>)}
              </select>
            </label>
          )}
          <div className="pg-form__row">
            <label className="pg-field">
              <span>{t('pub.booking.date')}</span>
              <input type="date" min={todayLocal()} value={form.date} onChange={(e) => set('date', e.target.value)} aria-invalid={errors.date ? true : undefined} />
              {err('date') && <small className="pg-field__err" role="alert">{err('date')}</small>}
            </label>
            <label className="pg-field">
              <span>{t('pub.booking.slot')}</span>
              <select value={form.slot} onChange={(e) => set('slot', e.target.value as BookingRequest['slot'])}>
                {BOOKING_SLOTS.map((s) => <option key={s} value={s}>{t(`pub.booking.slots.${s}`)}</option>)}
              </select>
            </label>
          </div>
          <label className="pg-field">
            <span>{t('pub.booking.messageLabel')}</span>
            <textarea rows={3} value={form.message} onChange={(e) => set('message', e.target.value)} maxLength={420} aria-invalid={errors.message ? true : undefined} />
            {err('message') && <small className="pg-field__err" role="alert">{err('message')}</small>}
          </label>
          <button type="submit" className="pg-btn pg-btn--send" aria-disabled={ctx.preview || undefined}>
            <span className="pg-btn__icon"><Icon name="whatsapp" size={20} /></span>
            <span className="pg-btn__body"><span className="pg-btn__title">{t('pub.booking.send')}</span></span>
          </button>
          <p className="pg-note pg-note--legal"><Icon name="shield" size={13} /> {t('pub.booking.privacy')}</p>
        </form>
      )}
      {note && <p className="pg-note">{note}</p>}
    </section>
  );
}
