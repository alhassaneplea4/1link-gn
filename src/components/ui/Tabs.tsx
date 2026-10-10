import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '@/utilities/misc';
import { Icon, type IconName } from './Icon';

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: IconName;
  panel: ReactNode;
  badge?: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  label: string;
  variant?: 'underline' | 'pills';
  className?: string;
}

/** Onglets WAI-ARIA : flèches gauche/droite, Début/Fin, activation automatique. */
export function Tabs({ items, value, defaultValue, onChange, label, variant = 'underline', className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.id ?? '');
  const current = value ?? internal;
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };
  const onKey = (e: KeyboardEvent) => {
    const idx = items.findIndex((i) => i.id === current);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const item = items[next]!;
    select(item.id);
    list.current?.querySelector<HTMLElement>(`[data-tab="${item.id}"]`)?.focus();
  };
  return (
    <div className={cx('tabs', `tabs--${variant}`, className)}>
      <div className="tabs__list" role="tablist" aria-label={label} ref={list} onKeyDown={onKey}>
        {items.map((it) => {
          const selected = it.id === current;
          return (
            <button
              key={it.id} type="button" role="tab" data-tab={it.id} id={`${base}-tab-${it.id}`} aria-selected={selected} aria-controls={`${base}-panel-${it.id}`}
              tabIndex={selected ? 0 : -1} className={cx('tabs__tab', selected && 'is-active')} onClick={() => select(it.id)}
            >
              {it.icon && <Icon name={it.icon} size={16} />}
              {it.label}
              {it.badge != null && <span className="tabs__badge">{it.badge}</span>}
            </button>
          );
        })}
      </div>
      {items.map((it) => (
        <div key={it.id} role="tabpanel" id={`${base}-panel-${it.id}`} aria-labelledby={`${base}-tab-${it.id}`} hidden={it.id !== current} tabIndex={0} className="tabs__panel">
          {it.id === current && it.panel}
        </div>
      ))}
    </div>
  );
}

/** Contrôle segmenté (groupe de radios stylé) : filtres de période, options d'apparence. */
export function Segmented<T extends string>({ label, value, options, onChange, size = 'md', className }: { label: string; value: T; options: { value: T; label: ReactNode; icon?: IconName; title?: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md'; className?: string }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = options[(idx + dir + options.length) % options.length]!;
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-v="${next.value}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cx('segmented', `segmented--${size}`, className)} onKeyDown={onKey}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" data-v={o.value} aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} title={o.title} className={cx('segmented__opt', o.value === value && 'is-active')} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={size === 'sm' ? 14 : 16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
