import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Icon, Input, useToast } from '@/components/ui';
import { CATEGORY_CONFIG } from '@/features/categories/config';
import { uploadImage } from '@/services/media';
import { useT, translate } from '@/i18n/core';
import type { MessageKey } from '@/i18n/types';
import { CATEGORY_IDS } from '@/models/category';
import { useSession } from '@/state/session';
import { initials } from '@/utilities/misc';
import { useOnboarding } from './store';
import type { StepErrors } from './validate';

interface StepProps { errors: StepErrors; showErrors: boolean }
const tr = (k: string) => translate(k as MessageKey);
const err = (e: StepErrors, key: string, show: boolean) => (show && e[key] ? tr(e[key]!) : undefined);

/** Section visible d'une étape : pastille d'icône, titre et courte explication. */
export function StepSection({ icon, title, hint, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="obsec">
      <header className="obsec__head">
        <span className="obsec__icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
        <div><h2 className="obsec__title">{title}</h2>{hint && <p className="obsec__hint">{hint}</p>}</div>
      </header>
      <div className="obsec__body">{children}</div>
    </section>
  );
}

/** Aperçu façon profil : couverture + photo qui la chevauche, chacune à choisir, modifier ou supprimer. */
function ProfileMedia({ name, avatarUrl, coverUrl, onAvatar, onCover }: { name: string; avatarUrl: string; coverUrl: string; onAvatar: (v: string) => void; onCover: (v: string) => void }) {
  const t = useT('onboarding', 'editor');
  const toast = useToast();
  const coverInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'cover' | 'avatar' | null>(null);
  const pick = async (file: File | undefined, kind: 'cover' | 'avatar') => {
    if (!file) return;
    setBusy(kind);
    try {
      (kind === 'cover' ? onCover : onAvatar)(await uploadImage(file));
    } catch {
      toast.push({ tone: 'error', title: t('editor.form.uploadError') });
    } finally {
      setBusy(null);
      const input = kind === 'cover' ? coverInput.current : avatarInput.current;
      if (input) input.value = '';
    }
  };
  return (
    <div className="pmedia">
      <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0], 'cover')} />
      <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0], 'avatar')} />
      <button type="button" className="pmedia__cover" onClick={() => coverInput.current?.click()} aria-label={coverUrl ? t('editor.form.changeImage') : t('onboarding.identity.coverAdd')}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <span className="pmedia__coverEmpty"><Icon name="image-plus" size={22} /> {t('onboarding.identity.coverAdd')}</span>}
      </button>
      <button type="button" className="pmedia__avatar" onClick={() => avatarInput.current?.click()} aria-label={avatarUrl ? t('editor.form.changeImage') : t('onboarding.identity.photo')}>
        {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials(name) || <Icon name="camera" size={22} />}</span>}
        <i className="pmedia__badge" aria-hidden="true"><Icon name="camera" size={12} /></i>
      </button>
      <div className="pmedia__actions">
        <div>
          <strong>{t('onboarding.identity.coverTitle')}</strong>
          <div className="pmedia__btns">
            <Button size="sm" variant={coverUrl ? 'secondary' : 'gradient'} iconLeft={coverUrl ? 'pencil' : 'upload'} loading={busy === 'cover'} onClick={() => coverInput.current?.click()}>{coverUrl ? t('editor.form.changeImage') : t('onboarding.identity.coverAdd')}</Button>
            {coverUrl && <Button size="sm" variant="ghost" iconLeft="trash" onClick={() => onCover('')}>{t('editor.form.removeImage')}</Button>}
          </div>
          <p className="field__hint">{t('onboarding.identity.coverHint')}</p>
        </div>
        <div>
          <strong>{t('onboarding.identity.photoTitle')}</strong>
          <div className="pmedia__btns">
            <Button size="sm" variant={avatarUrl ? 'secondary' : 'gradient'} iconLeft={avatarUrl ? 'pencil' : 'camera'} loading={busy === 'avatar'} onClick={() => avatarInput.current?.click()}>{avatarUrl ? t('editor.form.changeImage') : t('onboarding.identity.photo')}</Button>
            {avatarUrl && <Button size="sm" variant="ghost" iconLeft="trash" onClick={() => onAvatar('')}>{t('editor.form.removeImage')}</Button>}
          </div>
          <p className="field__hint">{t('onboarding.identity.photoHint')}</p>
        </div>
      </div>
    </div>
  );
}

/* — 1. Catégorie — */
export function CategoryStep({ errors, showErrors }: StepProps) {
  const t = useT('onboarding', 'common');
  const category = useOnboarding((s) => s.category);
  const set = useOnboarding((s) => s.set);
  return (
    <fieldset className="catgrid">
      <legend className="sr-only">{t('onboarding.category.legend')}</legend>
      {CATEGORY_IDS.map((c) => {
        const cfg = CATEGORY_CONFIG[c];
        const active = category === c;
        return (
          <label key={c} className={`catcard ${active ? 'is-active' : ''}`}>
            <input type="radio" name="category" value={c} checked={active} onChange={() => set('category', c)} />
            <span className="catcard__icon"><Icon name={cfg.icon} size={24} /></span>
            <span className="catcard__text">
              <strong>{t(`common.categories.${c}.label`)}</strong>
              <small>{t(`common.categories.${c}.description`)}</small>
              <span className="catcard__tags">{[...new Set(cfg.focus.map((f) => f.id))].slice(0, 3).map((f) => <Badge key={f} tone="neutral">{t(`marketing.audiences.focus.${f}`)}</Badge>)}</span>
            </span>
            <span className="catcard__check" aria-hidden="true"><Icon name="check" size={14} strokeWidth={3.4} /></span>
          </label>
        );
      })}
      {err(errors, 'category', showErrors) && <p className="field__error" role="alert"><Icon name="alert-circle" size={14} /> {err(errors, 'category', showErrors)}</p>}
    </fieldset>
  );
}

/* — 2. Profil : photo, couverture, nom complet, secteur d'activité et titre — */
export function ProfileStep({ errors, showErrors }: StepProps) {
  const t = useT('onboarding', 'editor', 'common');
  const identity = useOnboarding((s) => s.identity);
  const activity = useOnboarding((s) => s.activity);
  const patch = useOnboarding((s) => s.patch);
  const sessionName = useSession((s) => s.session?.user.name ?? '');
  const category = useOnboarding((s) => s.category);
  const organization = category === 'business' || category === 'organization';

  // Le nom provisoire tiré de l'adresse e-mail sert de point de départ : la personne le corrige.
  useEffect(() => {
    if (!identity.displayName && sessionName) patch('identity', { displayName: sessionName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stepform">
      <StepSection icon="camera" title={t('onboarding.sections.photos.title')} hint={t('onboarding.sections.photos.hint')}>
        <ProfileMedia name={identity.displayName || sessionName} avatarUrl={identity.avatarUrl} coverUrl={identity.coverUrl ?? ''} onAvatar={(v) => patch('identity', { avatarUrl: v })} onCover={(v) => patch('identity', { coverUrl: v })} />
      </StepSection>
      <StepSection icon="user" title={t('onboarding.sections.identity.title')} hint={t('onboarding.sections.identity.hint')}>
        <Input label={organization ? t('onboarding.profile.nameOrg') : t('onboarding.profile.name')} hint={t('onboarding.profile.nameHint')} value={identity.displayName} required autoComplete="name" maxLength={60}
          onChange={(e) => patch('identity', { displayName: e.target.value })} error={err(errors, 'displayName', showErrors)} />
        <Input label={t('onboarding.profile.sector')} hint={t('onboarding.profile.sectorHint')} value={activity.sector ?? ''} maxLength={60}
          onChange={(e) => patch('activity', { sector: e.target.value })} error={err(errors, 'sector', showErrors)} />
        <Input label={t('onboarding.profile.titleField')} hint={t('onboarding.profile.titleHint')} value={activity.headline ?? ''} maxLength={90}
          onChange={(e) => patch('activity', { headline: e.target.value })} error={err(errors, 'headline', showErrors)} />
      </StepSection>
    </div>
  );
}
