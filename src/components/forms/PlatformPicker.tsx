import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BrandIcon, brandColor } from '@/components/ui/BrandIcon';
import { Icon } from '@/components/ui/Icon';
import { hasMessage, translate, useT } from '@/i18n/core';
import type { MessageKey } from '@/i18n/types';
import { PLATFORMS, platformById, searchPlatforms } from '@/models/platforms';
import './platform-picker.css';

interface Option { id: string; name: string }

interface Props {
  id?: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (id: string) => void;
  /** Ajoute l'option « Lien générique » (icône neutre) en tête de liste. */
  allowLink?: boolean;
}

/** Nom affiché d'une plateforme : nom de marque, sauf « Site web » et « Lien » traduits. */
export function platformLabel(id: string): string {
  const key = `editor.options.platform.${id}`;
  if ((id === 'website' || id === 'link') && hasMessage(key)) return translate(key as MessageKey);
  return platformById(id)?.name ?? id;
}

/**
 * Sélecteur de plateforme à recherche : on tape quelques lettres (« dis », « twi »…) et la liste se réduit en montrant
 * nom et logo ; ↑ ↓ Entrée au clavier. Schéma ARIA « combobox » avec liste.
 */
export function PlatformPicker({ id: idProp, label, hint, value, onChange, allowLink }: Props) {
  const t = useT('editor');
  const uid = useId();
  const id = idProp ?? `pp-${uid}`;
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const options = useMemo<Option[]>(() => {
    const found = searchPlatforms(query).map((p) => ({ id: p.id, name: platformLabel(p.id) }));
    const link = { id: 'link', name: platformLabel('link') };
    const wantsLink = allowLink && (!query.trim() || link.name.toLowerCase().includes(query.trim().toLowerCase()) || 'lien link autre other'.includes(query.trim().toLowerCase()));
    return wantsLink ? [link, ...found] : found;
  }, [query, allowLink]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = value === 'link' ? { id: 'link', name: platformLabel('link') } : { id: value, name: platformLabel(value) };
  const close = () => { setOpen(false); setQuery(''); };
  const choose = (o: Option) => { onChange(o.id); close(); input.current?.blur(); };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); const o = options[active]; if (o) choose(o); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); }
  };

  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open, id]);

  const color = brandColor(current.id);
  return (
    <div className="field platform-picker" ref={root}>
      <label className="field__label" htmlFor={id}>{label}</label>
      <div className="platform-picker__control">
        <span className="platform-picker__logo" style={color ? { background: `#${color}` } : undefined} aria-hidden="true"><BrandIcon platform={current.id} size={18} /></span>
        <input
          ref={input} id={id} className="platform-picker__input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined} autoComplete="off" spellCheck={false}
          placeholder={t('editor.form.platformSearch')}
          value={open ? query : current.name}
          onFocus={(e) => { setOpen(true); setQuery(''); e.currentTarget.select(); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKey}
        />
        <Icon name="search" size={16} className="platform-picker__icon" />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="platform-picker__list">
          {options.length === 0 && <li className="platform-picker__empty" role="presentation">{t('editor.form.platformNone')}</li>}
          {options.map((o, i) => {
            const c = brandColor(o.id);
            return (
              <li
                key={o.id} id={`${id}-opt-${i}`} role="option" aria-selected={o.id === value} className={`platform-picker__opt ${i === active ? 'is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseMove={() => setActive(i)}
              >
                <span className="platform-picker__logo" style={c ? { background: `#${c}` } : undefined} aria-hidden="true"><BrandIcon platform={o.id} size={16} /></span>
                <span>{o.name}</span>
                {o.id === value && <Icon name="check" size={14} className="platform-picker__check" />}
              </li>
            );
          })}
        </ul>
      )}
      <p className="field__hint">{hint ?? t('editor.form.platformHint', { count: PLATFORMS.length })}</p>
    </div>
  );
}
