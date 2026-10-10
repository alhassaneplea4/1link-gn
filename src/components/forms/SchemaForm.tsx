import { useRef, useState } from 'react';
import { Button, IconButton, Input, Select, Textarea, Toggle, useToast } from '@/components/ui';
import { translate, useT, hasMessage } from '@/i18n/core';
import type { MessageKey } from '@/i18n/types';
import type { FieldDef, FieldErrors, ListField, ScalarField } from '@/features/page-engine/blocks/schema';
import { uploadImage } from '@/services/media';
import { move } from '@/utilities/misc';

type Values = Record<string, unknown>;

interface SchemaFormProps {
  /** Préfixe des clés de libellé : `editor.blocks.<type>` ou `onboarding.activity.<category>`. */
  labelPrefix: string;
  fields: readonly FieldDef[];
  data: Values;
  errors: FieldErrors;
  onChange: (patch: Values) => void;
  /** Affiche toutes les erreurs (ex. après une tentative de publication). */
  showAllErrors?: boolean;
  idPrefix?: string;
}

// Les clés sont construites par convention depuis le schéma : un test vérifie que chaque champ du registre est traduit.
const tr = (key: string, params?: Record<string, string | number>) => translate(key as MessageKey, params);
const optional = (key: string) => (hasMessage(key) ? tr(key) : undefined);

function ImageControl({ field, label, hint, value, error, onChange, onBlur, id }: { field: ScalarField; label: string; hint?: string; value: string; error?: string; onChange: (v: string) => void; onBlur: () => void; id: string }) {
  const t = useT('editor');
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadImage(file));
    } catch {
      toast.push({ tone: 'error', title: t('editor.form.uploadError') });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="image-field">
      <Input id={id} label={label} hint={hint} error={error} type="text" inputMode="url" placeholder="https://" value={value.startsWith('data:') ? t('editor.form.imageUploaded') : value} readOnly={value.startsWith('data:')} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} optionalLabel={field.required ? undefined : t('editor.form.optional')} required={field.required} />
      <div className="image-field__actions">
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        <Button size="sm" variant="secondary" iconLeft="upload" loading={busy} onClick={() => input.current?.click()}>{t('editor.form.chooseFile')}</Button>
        {value && <Button size="sm" variant="ghost" iconLeft="x" onClick={() => onChange('')}>{t('editor.form.removeImage')}</Button>}
        {value && !value.startsWith('data:') ? null : null}
      </div>
    </div>
  );
}

export function SchemaForm({ labelPrefix, fields, data, errors, onChange, showAllErrors, idPrefix = 'f' }: SchemaFormProps) {
  const t = useT('editor', 'common');
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (path: string) => setTouched((s) => (s.has(path) ? s : new Set(s).add(path)));
  const errorFor = (path: string) => (showAllErrors || touched.has(path)) && errors[path] ? tr(errors[path]!) : undefined;

  const renderField = (f: FieldDef, values: Values, set: (patch: Values) => void, path: string): React.ReactNode => {
    const id = `${idPrefix}-${path.replace(/\./g, '-')}`;
    const label = tr(`${labelPrefix}.fields.${f.name}`);
    const hint = optional(`${labelPrefix}.hints.${f.name}`);
    const placeholder = optional(`${labelPrefix}.placeholders.${f.name}`);
    const val = values[f.name];
    switch (f.kind) {
      case 'text':
      case 'email':
      case 'tel':
      case 'number':
      case 'url':
        return (
          <Input key={path} id={id} label={label} hint={hint} placeholder={placeholder} required={f.required} optionalLabel={f.required ? undefined : t('common.optional')}
            type={f.kind === 'text' || f.kind === 'number' ? 'text' : f.kind === 'url' ? 'url' : f.kind} inputMode={f.kind === 'tel' ? 'tel' : f.kind === 'url' ? 'url' : f.kind === 'number' ? 'decimal' : undefined} autoComplete="off"
            value={String(val ?? '')} maxLength={'max' in f && f.max ? f.max + 40 : undefined} error={errorFor(path)}
            onChange={(e) => set({ [f.name]: e.target.value })} onBlur={() => touch(path)} />
        );
      case 'textarea':
        return (
          <Textarea key={path} id={id} label={label} hint={hint} placeholder={placeholder} required={f.required} optionalLabel={f.required ? undefined : t('common.optional')}
            value={String(val ?? '')} maxLength={f.max} showCount={Boolean(f.max)} error={errorFor(path)} rows={3}
            onChange={(e) => set({ [f.name]: e.target.value })} onBlur={() => touch(path)} />
        );
      case 'image':
        return <ImageControl key={path} id={id} field={f} label={label} hint={hint} value={String(val ?? '')} error={errorFor(path)} onChange={(v) => set({ [f.name]: v })} onBlur={() => touch(path)} />;
      case 'select':
        return (
          <Select key={path} id={id} label={label} hint={hint} value={String(val ?? f.options[0])} onChange={(e) => set({ [f.name]: e.target.value })}>
            {f.options.map((o) => <option key={o} value={o}>{tr(`editor.options.${f.name}.${o}`)}</option>)}
          </Select>
        );
      case 'toggle':
        return <Toggle key={path} id={id} label={label} hint={hint} checked={Boolean(val)} onChange={(c) => set({ [f.name]: c })} />;
      case 'list':
        return renderList(f, values, set, path, label);
    }
  };

  const renderList = (f: ListField, values: Values, set: (patch: Values) => void, path: string, label: string) => {
    const items = (Array.isArray(values[f.name]) ? values[f.name] : []) as Values[];
    const update = (next: Values[]) => set({ [f.name]: next });
    return (
      <fieldset key={path} className="list-field">
        <legend className="field__label">{label}</legend>
        <ol role="list" className="list-field__items">
          {items.map((item, i) => (
            <li key={i} className="list-field__item">
              <div className="list-field__head">
                <span className="list-field__n">{t('editor.form.item', { n: i + 1 })}</span>
                <span className="list-field__tools">
                  <IconButton size="sm" icon="arrow-up" label={t('editor.form.moveUp')} disabled={i === 0} onClick={() => update(move(items, i, i - 1))} />
                  <IconButton size="sm" icon="arrow-down" label={t('editor.form.moveDown')} disabled={i === items.length - 1} onClick={() => update(move(items, i, i + 1))} />
                  <IconButton size="sm" icon="trash" variant="danger" label={t('editor.form.removeItem')} onClick={() => update(items.filter((_, k) => k !== i))} />
                </span>
              </div>
              <div className="list-field__fields">
                {f.itemFields.map((sub) => renderField(sub, item, (patch) => update(items.map((it, k) => (k === i ? { ...it, ...patch } : it))), `${path}.${i}.${sub.name}`))}
              </div>
            </li>
          ))}
        </ol>
        <Button size="sm" variant="secondary" iconLeft="plus" disabled={items.length >= f.max} onClick={() => update([...items, structuredClone(f.defaultItem)])}>
          {t('editor.form.addItem')}
        </Button>
        {items.length >= f.max && <p className="field__hint">{t('editor.form.maxItems', { max: f.max })}</p>}
      </fieldset>
    );
  };

  return <div className="schema-form">{fields.map((f) => renderField(f, data, onChange, f.name))}</div>;
}
