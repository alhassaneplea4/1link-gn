import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Icon, IconButton, Input, Textarea, useToast } from '@/components/ui';
import { SchemaForm } from '@/components/forms/SchemaForm';
import { CATEGORY_CONFIG } from '@/features/categories/config';
import { getThemePreset, themeOrder } from '@/features/page-engine/appearance/themes';
import { type FieldDef } from '@/features/page-engine/blocks/schema';
import { env, publicUrl } from '@/app/configuration/env';
import { paths } from '@/app/configuration/paths';
import { api } from '@/services/api';
import { uploadImage } from '@/services/media';
import { useT, translate } from '@/i18n/core';
import type { MessageKey } from '@/i18n/types';
import { CATEGORY_IDS } from '@/models/category';
import { SOCIAL_PLATFORMS } from '@/models/blocks';
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
  const toast = useToast();
  const identity = useOnboarding((s) => s.identity);
  const patch = useOnboarding((s) => s.patch);
  const sessionName = useSession((s) => s.session?.user.name ?? '');
  const [avail, setAvail] = useState<'idle' | 'checking' | 'available' | 'taken' | 'reserved'>('idle');
  const file = useRef<HTMLInputElement>(null);

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
      <div className="avatarpick">
        <span className="avatarpick__img" aria-hidden="true">{identity.avatarUrl ? <img src={identity.avatarUrl} alt="" /> : initials(identity.displayName || sessionName)}</span>
        <div>
          <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { patch('identity', { avatarUrl: await uploadImage(f) }); } catch { toast.push({ tone: 'error', title: t('editor.form.uploadError') }); }
          }} />
          <Button size="sm" variant="secondary" iconLeft="camera" onClick={() => file.current?.click()}>{t('onboarding.identity.photo')}</Button>
          {identity.avatarUrl && <Button size="sm" variant="ghost" onClick={() => patch('identity', { avatarUrl: '' })}>{t('editor.form.removeImage')}</Button>}
          <p className="field__hint">{t('onboarding.identity.photoHint')}</p>
        </div>
      </div>
      <Input label={t('onboarding.identity.name')} hint={t('onboarding.identity.nameHint')} value={identity.displayName} required autoComplete="name"
        onChange={(e) => patch('identity', { displayName: e.target.value, ...(slugifyUsername(identity.displayName) === identity.username || !identity.username ? { username: slugifyUsername(e.target.value) } : {}) })} error={err(errors, 'displayName', showErrors)} />
      <Input label={t('onboarding.identity.username')} hint={t('onboarding.identity.usernameHint')} value={identity.username} required autoComplete="off" spellCheck={false} prefix={`${env.publicDomain}/`}
        onChange={(e) => patch('identity', { username: slugifyUsername(e.target.value) })} error={usernameError}
        suffix={avail === 'checking' ? <span className="spinner" style={{ width: 14, height: 14 }} aria-label={t('onboarding.identity.checking')} /> : avail === 'available' ? <Icon name="check-circle" size={18} label={t('onboarding.identity.available')} /> : undefined} />
      {avail === 'available' && <p className="field__hint stepform__ok"><Icon name="check" size={14} strokeWidth={3} /> {t('onboarding.identity.available')} · <span className="mono">{publicUrl(identity.username)}</span></p>}
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
      <SchemaForm idPrefix="ob-act" labelPrefix={`onboarding.activity.${category}`} fields={cfg.activityFields} data={activity as Record<string, unknown>} errors={errors as never} showAllErrors={showErrors} onChange={(p) => patch('activity', p as Partial<OnboardingData['activity']>)} />
    </div>
  );
}

/* — 4. Liens — */
const LINKS_FIELDS: FieldDef[] = [
  { kind: 'list', name: 'socials', max: 8, defaultItem: { platform: 'instagram', url: '' }, itemFields: [{ kind: 'select', name: 'platform', options: SOCIAL_PLATFORMS }, { kind: 'url', name: 'url' }] },
  { kind: 'list', name: 'links', max: 6, defaultItem: { title: '', url: '' }, itemFields: [{ kind: 'text', name: 'title', max: 60 }, { kind: 'url', name: 'url' }] },
];
export function LinksStep({ errors, showErrors }: StepProps) {
  const t = useT('onboarding');
  const socials = useOnboarding((s) => s.socials);
  const links = useOnboarding((s) => s.links);
  const set = useOnboarding((s) => s.set);
  return (
    <div className="stepform">
      <p className="muted">{t('onboarding.links.intro')}</p>
      <SchemaForm idPrefix="ob-links" labelPrefix="onboarding.links" fields={LINKS_FIELDS} data={{ socials, links }} errors={errors as never} showAllErrors={showErrors}
        onChange={(p) => { if (p.socials) set('socials', p.socials as OnboardingData['socials']); if (p.links) set('links', p.links as OnboardingData['links']); }} />
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
  const verified = useSession((s) => s.session?.user.emailVerified ?? false);
  const errKey = error && ['username_taken', 'username_invalid', 'username_reserved', 'email_not_verified', 'plan_limit'].includes(error) ? error : error ? 'unknown' : null;
  return (
    <div className="stepform">
      <p className="muted">{t('onboarding.publish.intro')}</p>
      <div className="pubcard">
        <Icon name="link" size={20} />
        <div><strong className="mono">{publicUrl(doc.username)}</strong><small>{t('onboarding.publish.address')}</small></div>
      </div>
      {env.isDemo && <Alert tone="warning" title={t('editor.publish.demoTitle')}>{t('editor.publish.demoBefore')}</Alert>}
      {!verified && (
        <Alert tone="warning" title={t('editor.publish.unverifiedTitle')} action={<Link className="btn btn--secondary btn--sm" to={paths.verifyEmail}><span className="btn__label">{t('editor.publish.verifyNow')}</span></Link>}>
          {t('onboarding.publish.unverifiedText')}
        </Alert>
      )}
      {errKey && <Alert tone="danger" title={t('editor.publish.failed')}>{tr(`editor.publish.errors.${errKey}`)}</Alert>}
      <div className="pubactions">
        <Button variant="gradient" size="lg" iconLeft="rocket" loading={busy} disabled={!verified} onClick={onPublish}>{t('onboarding.publish.publish')}</Button>
        <Button variant="secondary" size="lg" disabled={busy} onClick={onSaveDraft}>{t('onboarding.publish.draft')}</Button>
      </div>
      <p className="subtle">{t('onboarding.publish.draftHint')}</p>
    </div>
  );
}
