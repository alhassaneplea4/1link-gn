import { useRef, useState } from 'react';
import { Button, Input, Segmented, useToast } from '@/components/ui';
import { useT } from '@/i18n/core';
import { CARD_FIELD_LIMITS, CARD_TEMPLATES, type CardDesign, type CardTemplateId } from '@/models/cards';
import { uploadImage } from '@/services/media';
import { initials } from '@/utilities/misc';

export interface DesignErrors { name?: string }

/**
 * Personnalisation d'une carte, dans les limites du modèle : textes courts, une photo ou un logo, et une couleur d'accent
 * choisie parmi celles prévues par le design. Réutilisé par l'assistant de commande et par la correction du visuel.
 */
export function DesignFields({ design, onChange, errors, profileImage }: { design: CardDesign; onChange: (patch: Partial<CardDesign>) => void; errors?: DesignErrors; profileImage?: string }) {
  const t = useT('cards', 'common');
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const tpl = CARD_TEMPLATES[design.templateId];

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange({ imageUrl: await uploadImage(file) });
    } catch {
      toast.push({ tone: 'error', title: t('cards.design.uploadError') });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="cardform">
      <div className="cardform__row">
        <Input label={t('cards.design.name')} value={design.name} maxLength={CARD_FIELD_LIMITS.name} required autoComplete="name" onChange={(e) => onChange({ name: e.target.value })} error={errors?.name} />
        <Input label={t('cards.design.jobTitle')} value={design.title} maxLength={CARD_FIELD_LIMITS.title} optionalLabel={t('common.optional')} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div className="cardform__row">
        <Input label={t('cards.design.organization')} value={design.organization} maxLength={CARD_FIELD_LIMITS.organization} optionalLabel={t('common.optional')} onChange={(e) => onChange({ organization: e.target.value })} />
        <Input label={t('cards.design.contact')} hint={t('cards.design.contactHint')} value={design.contact} maxLength={CARD_FIELD_LIMITS.contact} optionalLabel={t('common.optional')} onChange={(e) => onChange({ contact: e.target.value })} />
      </div>

      <div className="field">
        <span className="field__label">{t('cards.design.image')}</span>
        <div className="cardimg">
          <span className="cardimg__thumb" aria-hidden="true">{design.imageUrl ? <img src={design.imageUrl} alt="" /> : <span>{initials(design.name) || '1L'}</span>}</span>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <Button size="sm" variant="secondary" iconLeft="upload" loading={busy} onClick={() => input.current?.click()}>{design.imageUrl ? t('cards.design.changeImage') : t('cards.design.addImage')}</Button>
          {profileImage && profileImage !== design.imageUrl && <Button size="sm" variant="ghost" iconLeft="user" onClick={() => onChange({ imageUrl: profileImage })}>{t('cards.design.useProfileImage')}</Button>}
          {design.imageUrl && <Button size="sm" variant="ghost" iconLeft="trash" onClick={() => onChange({ imageUrl: '' })}>{t('cards.design.removeImage')}</Button>}
        </div>
        <Segmented size="sm" label={t('cards.design.imageKind')} value={design.imageKind} onChange={(v) => onChange({ imageKind: v })} options={[{ value: 'photo', label: t('cards.design.photo') }, { value: 'logo', label: t('cards.design.logo') }]} className="cardimg__kind" />
        <p className="field__hint">{t('cards.design.imageHint')}</p>
      </div>

      <div className="field">
        <span className="field__label" id="card-accent-label">{t('cards.design.accent')}</span>
        <div className="cswatches" role="group" aria-labelledby="card-accent-label">
          {tpl.accents.map((c) => (
            <button key={c} type="button" className="cswatch" style={{ background: c }} aria-label={c} aria-pressed={design.accent === c} onClick={() => onChange({ accent: c })} />
          ))}
        </div>
        <p className="field__hint">{t('cards.design.accentHint')}</p>
      </div>
    </div>
  );
}

/** Changer de modèle conserve les textes et l'image, et ramène l'accent à une couleur permise par le nouveau modèle. */
export function withTemplate(design: CardDesign, templateId: CardTemplateId): CardDesign {
  const tpl = CARD_TEMPLATES[templateId];
  return { ...design, templateId, accent: tpl.accents.includes(design.accent) ? design.accent : tpl.accents[0]! };
}
