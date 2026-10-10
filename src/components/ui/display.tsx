import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '@/i18n/core';
import { cx, initials } from '@/utilities/misc';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/* — Badge — */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';
export function Badge({ tone = 'neutral', icon, dot, children, className }: { tone?: Tone; icon?: IconName; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('badge', `badge--${tone}`, className)}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {icon && <Icon name={icon} size={12} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

/** Signale sans ambiguïté qu'une donnée est fictive. À placer près de TOUT chiffre issu d'un adaptateur de démonstration. */
export function DemoBadge({ label, className }: { label?: string; className?: string }) {
  const t = useT('common');
  return (
    <Badge tone="warning" icon="flask" className={cx('demo-badge', className)}>
      {label ?? t('common.demo')}
    </Badge>
  );
}

/* — Alert — */
export function Alert({ tone = 'info', title, children, action, onDismiss, className, role }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: ReactNode; children?: ReactNode; action?: ReactNode; onDismiss?: () => void; className?: string; role?: 'alert' | 'status' }) {
  const t = useT('common');
  const icon: IconName = tone === 'success' ? 'check-circle' : tone === 'danger' ? 'x-circle' : tone === 'warning' ? 'alert' : 'info';
  return (
    <div className={cx('alert', `alert--${tone}`, className)} role={role ?? (tone === 'danger' ? 'alert' : 'status')}>
      <Icon name={icon} size={20} className="alert__icon" />
      <div className="alert__body">
        {title && <strong className="alert__title">{title}</strong>}
        {children && <div className="alert__text">{children}</div>}
        {action && <div className="alert__action">{action}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="alert__close" onClick={onDismiss} aria-label={t('common.close')}>
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

/* — Avatar — */
export function Avatar({ name, src, size = 40, className }: { name: string; src?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cx('avatar', className)} style={{ width: size, height: size, fontSize: size * 0.38 }} role="img" aria-label={name}>
      {src && !failed ? <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}

/* — Skeleton — */
export function Skeleton({ width, height = 14, radius, className }: { width?: number | string; height?: number | string; radius?: number | string; className?: string }) {
  return <span className={cx('skeleton', className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-text" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />)}
    </div>
  );
}

/* — États vides / erreur — */
export function EmptyState({ icon = 'inbox', title, description, action, compact }: { icon?: IconName; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('empty', compact && 'empty--compact')}>
      <span className="empty__icon"><Icon name={icon} size={compact ? 22 : 28} /></span>
      <h3 className="empty__title">{title}</h3>
      {description && <p className="empty__desc">{description}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ code, onRetry, compact }: { code?: string | null; onRetry?: () => void; compact?: boolean }) {
  const t = useT('common');
  const key = code === 'network' ? 'common.errors.network' : code === 'forbidden' ? 'common.errors.forbidden' : code === 'not_found' ? 'common.errors.notFound' : 'common.errors.generic';
  return (
    <div className={cx('empty empty--error', compact && 'empty--compact')} role="alert">
      <span className="empty__icon"><Icon name="alert" size={compact ? 22 : 28} /></span>
      <h3 className="empty__title">{t('common.errors.title')}</h3>
      <p className="empty__desc">{t(key)}</p>
      {onRetry && <div className="empty__action"><Button variant="secondary" size="sm" iconLeft="refresh" onClick={onRetry}>{t('common.retry')}</Button></div>}
    </div>
  );
}

/* — Breadcrumb — */
export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  const t = useT('common');
  return (
    <nav aria-label={t('common.breadcrumb')} className="breadcrumb">
      <ol>
        {items.map((it, i) => (
          <li key={i}>
            {it.to && i < items.length - 1 ? <Link to={it.to}>{it.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{it.label}</span>}
            {i < items.length - 1 && <Icon name="chevron-right" size={14} />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* — Carte, en-tête de page, progression — */
export function Card({ children, className, padding = 'md', as: Tag = 'section', ...rest }: HTMLAttributes<HTMLElement> & { padding?: 'none' | 'sm' | 'md' | 'lg'; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={cx('card', `card--${padding}`, className)} {...rest}>{children}</Tag>;
}

export function PageHeader({ title, description, actions, breadcrumb, badge }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode; badge?: ReactNode }) {
  return (
    <header className="page-header">
      {breadcrumb}
      <div className="page-header__row">
        <div className="page-header__text">
          <h1 className="page-header__title">{title}{badge}</h1>
          {description && <p className="page-header__desc">{description}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}

export function ProgressBar({ value, label, tone = 'brand' }: { value: number; label: string; tone?: 'brand' | 'success' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span className={cx('progress__bar', `progress__bar--${tone}`)} style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

/* — Pagination — */
export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const t = useT('common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums: (number | 'gap')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== 'gap') nums.push('gap');
  }
  return (
    <nav className="pagination" aria-label={t('common.pagination.label')}>
      <p className="pagination__info" aria-live="polite">{t('common.pagination.range', { from, to, total })}</p>
      <ul role="list" className="pagination__list">
        <li>
          <button type="button" className="pagination__btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('common.pagination.prev')}>
            <Icon name="chevron-left" size={16} />
          </button>
        </li>
        {nums.map((n, i) =>
          n === 'gap' ? (
            <li key={`g${i}`} aria-hidden="true" className="pagination__gap">…</li>
          ) : (
            <li key={n}>
              <button type="button" className={cx('pagination__btn', n === page && 'is-active')} aria-current={n === page ? 'page' : undefined} aria-label={t('common.pagination.page', { n })} onClick={() => onChange(n)}>
                {n}
              </button>
            </li>
          ),
        )}
        <li>
          <button type="button" className="pagination__btn" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t('common.pagination.next')}>
            <Icon name="chevron-right" size={16} />
          </button>
        </li>
      </ul>
    </nav>
  );
}

/* — Recherche (saisie temporisée) — */
export function SearchBar({ onSearch, placeholder, label, defaultValue = '', delay = 300, className }: { onSearch: (value: string) => void; placeholder?: string; label: string; defaultValue?: string; delay?: number; className?: string }) {
  const t = useT('common');
  const [value, setValue] = useState(defaultValue);
  const first = useRef(true);
  const cb = useRef(onSearch);
  cb.current = onSearch;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => cb.current(value.trim()), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return (
    <div className={cx('searchbar', className)} role="search">
      <Icon name="search" size={18} className="searchbar__icon" />
      <input type="search" className="searchbar__input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={label} />
      {value && (
        <button type="button" className="searchbar__clear" aria-label={t('common.clear')} onClick={() => { setValue(''); cb.current(''); }}>
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
