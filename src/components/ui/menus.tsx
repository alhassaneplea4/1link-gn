import { cloneElement, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useOutsideClick } from '@/hooks/dom';
import { cx } from '@/utilities/misc';
import { Icon, type IconName } from './Icon';

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  onSelect?: () => void;
  to?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Séparateur affiché avant l'élément. */
  separatorBefore?: boolean;
  description?: string;
}

interface DropdownProps {
  /** Élément déclencheur (un bouton) : il reçoit aria-haspopup / aria-expanded / onClick. */
  trigger: ReactElement<{ onClick?: () => void; 'aria-expanded'?: boolean; 'aria-haspopup'?: string; 'aria-controls'?: string; onKeyDown?: (e: KeyboardEvent) => void }>;
  items: MenuItem[];
  align?: 'start' | 'end';
  header?: ReactNode;
  className?: string;
}

/** Menu déroulant accessible : flèches, Début/Fin, Échap, fermeture au clic extérieur, retour du focus. */
export function Dropdown({ trigger, items, align = 'end', header, className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useOutsideClick(wrap, open, () => setOpen(false));

  const focusItem = useCallback((index: number) => {
    const els = wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    if (!els?.length) return;
    els[(index + els.length) % els.length]?.focus();
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => focusItem(0));
  }, [open, focusItem]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) wrap.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
    else if (e.key === 'End') { e.preventDefault(); focusItem(els.length - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={cx('dropdown', className)} ref={wrap}>
      {cloneElement(trigger, {
        onClick: () => setOpen((o) => !o),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        'aria-controls': open ? menuId : undefined,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); }
        },
      })}
      {open && (
        <div id={menuId} role="menu" className={cx('menu', `menu--${align}`)} onKeyDown={onMenuKey}>
          {header && <div className="menu__header">{header}</div>}
          {items.map((it) => {
            const content = (
              <>
                {it.icon && <Icon name={it.icon} size={18} />}
                <span className="menu__text">
                  <span>{it.label}</span>
                  {it.description && <small>{it.description}</small>}
                </span>
              </>
            );
            const cls = cx('menu__item', it.danger && 'is-danger');
            return (
              <div key={it.id} role="none">
                {it.separatorBefore && <div className="menu__sep" role="separator" />}
                {it.to && !it.disabled ? (
                  <Link role="menuitem" className={cls} to={it.to} tabIndex={-1} onClick={() => close(false)}>{content}</Link>
                ) : (
                  <button
                    type="button" role="menuitem" className={cls} tabIndex={-1} aria-disabled={it.disabled || undefined}
                    onClick={() => { if (it.disabled) return; setOpen(false); it.onSelect?.(); }}
                  >
                    {content}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Info-bulle accessible : visible au survol ET au focus clavier, reliée par aria-describedby. */
export function Tooltip({ text, children, side = 'top' }: { text: string; children: ReactElement<{ 'aria-describedby'?: string }>; side?: 'top' | 'bottom' }) {
  const id = useId();
  return (
    <span className="tooltip">
      {cloneElement(children, { 'aria-describedby': id })}
      <span role="tooltip" id={id} className={`tooltip__bubble tooltip__bubble--${side}`}>{text}</span>
    </span>
  );
}
