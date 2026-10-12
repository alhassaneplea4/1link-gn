import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Icon, IconButton, Input, Textarea, useToast } from '@/components/ui';
import { SchemaForm } from '@/components/forms/SchemaForm';
import { CATEGORY_CONFIG } from '@/features/categories/config';
import { getThemePreset, themeOrder } from '@/features/page-engine/appearance/themes';
import { type FieldDef } from '@/features/page-engine/blocks/schema';
import { env, publicUrl } from '@/app/configuration/env';
import { api } from '@/services/api';
import { uploadImage } from '@/services/media';
import { useT, translate } from '@/i18n/core';
import type { MessageKey } from '@/i18n/types';
import { CATEGORY_IDS } from '@/models/category';
import type { PageDocument } from '@/models/page';
import { useSession } from '@/state/session';
import { initials, move } from '@/utilities/misc';
import { slugifyUsername } from '@/utilities/validation';
import { useOnboarding } from './store';
import type { StepErrors } from './validate';
import type { OnboardingData } from './store';

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

/* — 2. Identité — */
export function IdentityStep({ errors, showErrors }: StepProps) {
  const t = useT('onboarding', 'editor', 'common');
  const identity = useOnboarding((s) => s.identity);
  const patch = useOnboarding((s) => s.patch);
  const sessionName = useSession((s) => s.session?.user.name ?? '');
  const [avail, setAvail] = useState<'idle' | 'checking' | 'available' | 'taken' | 'reserved'>('idle');

  useEffect(() => {
    if (!identity.displayName && sessionName) patch('identity', { displayName: sessionName, username: identity.username || slugifyUsername(sessionName) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!identity.username || errors.username) { setAvail('idle'); return; }
    setAvail('checking');
    let live = true;
    const id = setTimeout(() => {
      api.page.checkUsername(identity.username).then((r) => live && setAvail(r.available ? 'available' : r.reason === 'reserved' ? 'reserved' : 'taken'), () => live && setAvail('idle'));
    }, 350);
    return () => { live = false; clearTimeout(id); };
  }, [identity.username, errors.username]);

  const usernameError = err(errors, 'username', showErrors || identity.username !== '') ?? (avail === 'taken' ? t('onboarding.identity.taken') : avail === 'reserved' ? t('common.validation.usernameReserved') : undefined);
  return (
    <div className="stepform">
      <StepSection icon="camera" title={t('onboarding.sections.photos.title')} hint={t('onboarding.sections.photos.hint')}>
        <ProfileMedia name={identity.displayName || sessionName} avatarUrl={identity.avatarUrl} coverUrl={identity.coverUrl ?? ''} onAvatar={(v) => patch('identity', { avatarUrl: v })} onCover={(v) => patch('identity', { coverUrl: v })} />
      </StepSection>
      <StepSection icon="user" title={t('onboarding.sections.identity.title')} hint={t('onboarding.sections.identity.hint')}>
      <Input label={t('onboarding.identity.name')} hint={t('onboarding.identity.nameHint')} value={identity.displayName} required autoComplete="name"
        onChange={(e) => patch('identity', { displayName: e.target.value, ...(slugifyUsername(identity.displayName) === identity.username || !identity.username ? { username: slugifyUsername(e.target.value) } : {}) })} error={err(errors, 'displayName', showErrors)} />
      <Input label={t('onboarding.identity.username')} hint={t('onboarding.identity.usernameHint')} value={identity.username} required autoComplete="off" spellCheck={false} prefix={`${env.publicDomain}/`}
        onChange={(e) => patch('identity', { username: slugifyUsername(e.target.value) })} error={usernameError}
        suffix={avail === 'checking' ? <span className="spinner" style={{ width: 14, height: 14 }} aria-label={t('onboarding.identity.checking')} /> : avail === 'available' ? <Icon name="check-circle" size={18} label={t('onboarding.identity.available')} /> : undefined} />
      {avail === 'available' && <p className="field__hint stepform__ok"><Icon name="check" size={14} strokeWidth={3} /> {t('onboarding.identity.available')} · <span className="mono">{publicUrl(identity.username)}</span></p>}
      </StepSection>
    </div>
  );
}

/* — 3. Activité — */
export function ActivityStep({ errors, showErrors }: StepProps) {
  const t = useT('onboarding');
  const category = useOnboarding((s) => s.category) ?? 'individual';
  const activity = useOnboarding((s) => s.activity);
  const patch = useOnboarding((s) => s.patch);
  const cfg = CATEGORY_CONFIG[category];
  return (
    <div className="stepform">
      <Alert tone="info" title={t(`onboarding.activity.${category}.title`)}>{t(`onboarding.activity.${category}.intro`)}</Alert>
      <StepSection icon="briefcase" title={t('onboarding.sections.activity.title')} hint={t('onboarding.sections.activity.hint')}>
        <SchemaForm idPrefix="ob-act" labelPrefix={`onboarding.activity.${category}`} fields={cfg.activityFields} data={activity as Record<string, unknown>} errors={errors as never} showAllErrors={showErrors} onChange={(p) => patch('activity', p as Partial<OnboardingData['activity']>)} />
      </StepSection>
    </div>
  );
}

/* — 4. Liens — */
const LINKS_FIELDS: FieldDef[] = [
  { kind: 'list', name: 'socials', max: 8, defaultItem: { platform: 'instagram', url: 'https://instagram.com/' }, itemFields: [{ kind: 'platform', name: 'platform' }, { kind: 'url', name: 'url' }] },
  { kind: 'list', name: 'links', max: 6, defaultItem: { title: '', url: '' }, itemFields: [{ kind: 'text', name: 'title', max: 60 }, { kind: 'url', name: 'url' }] },
];
export function LinksStep({ errors, showErrors }: StepProps) {
  const t = useT('onboarding');
  const socials = useOnboarding((s) => s.socials);
  const links = useOnboarding((s) => s.links);
  const set = useOnboarding((s) => s.set);
  const onChange = (p: Record<string, unknown>) => { if (p.socials) set('socials', p.socials as OnboardingData['socials']); if (p.links) set('links', p.links as OnboardingData['links']); };
  return (
    <div className="stepform">
      <p className="muted">{t('onboarding.links.intro')}</p>
      <StepSection icon="share" title={t('onboarding.sections.socials.title')} hint={t('onboarding.sections.socials.hint')}>
        <SchemaForm idPrefix="ob-soc" labelPrefix="onboarding.links" fields={LINKS_FIELDS.slice(0, 1)} data={{ socials }} errors={errors as never} showAllErrors={showErrors} onChange={onChange} />
      </StepSection>
      <StepSection icon="link" title={t('onboarding.sections.links.title')} hint={t('onboarding.sections.links.hint')}>
        <SchemaForm idPrefix="ob-links" labelPrefix="onboarding.links" fields={LINKS_FIELDS.slice(1)} data={{ links }} errors={errors as never} showAllErrors={showErrors} onChange={onChange} />
      </StepSection>
    </div>
  );
}

/* — 5. Services ou contenus — */
export function ContentStep() {
  const t = useT('onboarding', 'common');
  const category = useOnboarding((s) => s.category) ?? 'individual';
  const items = useOnboarding((s) => s.items);
  const about = useOnboarding((s) => s.about);
  const set = useOnboarding((s) => s.set);
  const kind = CATEGORY_CONFIG[category].contentBlock;
  if (kind !== 'service' && kind !== 'portfolio') {
    return (
      <div className="stepform">
        <p className="muted">{t('onboarding.content.aboutIntro')}</p>
        <Textarea label={t('onboarding.content.about')} value={about} maxLength={600} showCount rows={5} optionalLabel={t('common.optional')} onChange={(e) => set('about', e.target.value)} />
      </div>
    );
  }
  const upd = (i: number, p: Partial<OnboardingData['items'][number]>) => set('items', items.map((it, k) => (k === i ? { ...it, ...p } : it)));
  return (
    <div className="stepform">
      <p className="muted">{t(`onboarding.content.${kind}Intro`)}</p>
      <ol role="list" className="itemlist">
        {items.map((it, i) => (
          <li key={i} className="itemlist__item">
            <div className="list-field__head">
              <span className="list-field__n">{t(`onboarding.content.${kind}Item`, { n: i + 1 })}</span>
              <span className="list-field__tools">
                <IconButton size="sm" icon="arrow-up" label={t('editor.form.moveUp')} disabled={i === 0} onClick={() => set('items', move(items, i, i - 1))} />
                <IconButton size="sm" icon="arrow-down" label={t('editor.form.moveDown')} disabled={i === items.length - 1} onClick={() => set('items', move(items, i, i + 1))} />
                <IconButton size="sm" icon="trash" variant="danger" label={t('editor.form.removeItem')} disabled={items.length === 1} onClick={() => set('items', items.filter((_, k) => k !== i))} />
              </span>
            </div>
            <Input label={t(`onboarding.content.${kind}Name`)} value={it.name} maxLength={80} onChange={(e) => upd(i, { name: e.target.value })} optionalLabel={t('common.optional')} />
            <Textarea label={t('onboarding.content.description')} value={it.description} maxLength={240} rows={2} optionalLabel={t('common.optional')} onChange={(e) => upd(i, { description: e.target.value })} />
            {kind === 'service' && <Input label={t('onboarding.content.price')} hint={t('onboarding.content.priceHint')} value={it.price} maxLength={40} optionalLabel={t('common.optional')} onChange={(e) => upd(i, { price: e.target.value })} />}
            {kind === 'portfolio' && <Input label={t('onboarding.content.image')} placeholder="https://" value={it.imageUrl} optionalLabel={t('common.optional')} onChange={(e) => upd(i, { imageUrl: e.target.value })} />}
          </li>
        ))}
      </ol>
      <Button variant="secondary" size="sm" iconLeft="plus" disabled={items.length >= 6} onClick={() => set('items', [...items, { name: '', description: '', price: '', imageUrl: '' }])}>{t('editor.form.addItem')}</Button>
    </div>
  );
}

/* — 6. Apparence — */
const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#0891b2', '#111827'];
export function AppearanceStep() {
  const t = useT('onboarding', 'common', 'appearance');
  const category = useOnboarding((s) => s.category) ?? 'individual';
  const themeId = useOnboarding((s) => s.themeId) ?? CATEGORY_CONFIG[category].themeId;
  const color = useOnboarding((s) => s.primaryColor);
  const set = useOnboarding((s) => s.set);
  return (
    <div className="stepform">
      <p className="muted">{t('onboarding.appearance.intro')}</p>
      <ul role="list" className="themegrid">
        {themeOrder.filter((id) => id !== 'custom').map((id) => {
          const p = getThemePreset(id);
          const bg = p.background.type === 'gradient' ? `linear-gradient(${p.background.gradient.angle}deg, ${p.background.gradient.from}, ${p.background.gradient.to})` : p.colors.background;
          return (
            <li key={id}>
              <button type="button" className={`themecard ${themeId === id ? 'is-active' : ''}`} aria-pressed={themeId === id} onClick={() => { set('themeId', id); set('primaryColor', null); }}>
                <span className="themecard__preview" style={{ background: bg, borderColor: p.colors.border }} aria-hidden="true"><i className="themecard__avatar" style={{ background: p.colors.primary }} /><i className="themecard__line" style={{ background: p.colors.text }} /><i className="themecard__btn" style={{ background: p.colors.primary, borderRadius: p.button.radius === 'pill' ? 99 : 6 }} /></span>
                <span className="themecard__name">{themeId === id && <Icon name="check-circle" size={14} />}{t(`common.themes.${id}`)}{CATEGORY_CONFIG[category].themeId === id && <Badge tone="violet">{t('onboarding.appearance.suggested')}</Badge>}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div>
        <p className="field__label">{t('onboarding.appearance.color')}</p>
        <div className="swatches" role="group" aria-label={t('onboarding.appearance.color')}>
          {COLORS.map((c) => <button key={c} type="button" className={`swatch ${color === c ? 'is-active' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={color === c} onClick={() => set('primaryColor', color === c ? null : c)} />)}
        </div>
      </div>
    </div>
  );
}

/* — 7. Prévisualisation — */
export function PreviewStep({ doc, go }: { doc: PageDocument; go: (i: number) => void }) {
  const t = useT('onboarding');
  const blocks = doc.blocks.filter((b) => b.type !== 'profile');
  return (
    <div className="stepform">
      <p className="muted">{t('onboarding.preview.intro')}</p>
      <ul role="list" className="summary">
        <li><Icon name="user" size={16} /><span>{t('onboarding.preview.profile')}</span><Button size="sm" variant="ghost" onClick={() => go(1)}>{t('common.edit')}</Button></li>
        <li><Icon name="layers" size={16} /><span>{t('onboarding.preview.blocks', { count: blocks.length })}</span><Button size="sm" variant="ghost" onClick={() => go(3)}>{t('common.edit')}</Button></li>
        <li><Icon name="palette" size={16} /><span>{t('onboarding.preview.theme')} : {tr(`common.themes.${doc.appearance.themeId}`)}</span><Button size="sm" variant="ghost" onClick={() => go(5)}>{t('common.edit')}</Button></li>
      </ul>
      <Alert tone="info">{t('onboarding.preview.later')}</Alert>
    </div>
  );
}

/* — 8. Publication — */
export function PublishStep({ doc, onPublish, onSaveDraft, busy, error }: { doc: PageDocument; onPublish: () => void; onSaveDraft: () => void; busy: boolean; error: string | null }) {
  const t = useT('onboarding', 'editor');
  const errKey = error && ['username_taken', 'username_invalid', 'username_reserved', 'email_not_verified', 'plan_limit'].includes(error) ? error : error ? 'unknown' : null;
  return (
    <div className="stepform">
      <p className="muted">{t('onboarding.publish.intro')}</p>
      <div className="pubcard">
        <Icon name="link" size={20} />
        <div><strong className="mono">{publicUrl(doc.username)}</strong><small>{t('onboarding.publish.address')}</small></div>
      </div>
      {errKey && <Alert tone="danger" title={t('editor.publish.failed')}>{tr(`editor.publish.errors.${errKey}`)}</Alert>}
      <div className="pubactions">
        <Button variant="gradient" size="lg" iconLeft="rocket" loading={busy} onClick={onPublish}>{t('onboarding.publish.publish')}</Button>
        <Button variant="secondary" size="lg" disabled={busy} onClick={onSaveDraft}>{t('onboarding.publish.draft')}</Button>
      </div>
      <p className="subtle">{t('onboarding.publish.draftHint')}</p>
    </div>
  );
}
