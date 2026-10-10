import type { ReactNode } from 'react';
import { useT } from '@/i18n/core';
import { cx } from '@/utilities/misc';
import { formatPercent } from '@/utilities/format';
import type { SortDir } from '@/models/api';
import { Sparkline } from '@/components/charts/charts';
import { DemoBadge, EmptyState, ErrorState, Pagination, Skeleton, Card } from './display';
import { Icon, type IconName } from './Icon';

/* — StatCard — */
export function StatCard({ label, value, delta, icon, hint, loading, demo, spark, className }: { label: string; value: ReactNode; delta?: number | null; icon?: IconName; hint?: ReactNode; loading?: boolean; demo?: boolean; spark?: number[]; className?: string }) {
  const t = useT('common');
  return (
    <Card className={cx('stat', className)} padding="md">
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {icon && <span className="stat__icon"><Icon name={icon} size={18} /></span>}
      </div>
      {loading ? (
        <Skeleton height={34} width="55%" />
      ) : (
        <div className="stat__value" aria-live="polite">{value}</div>
      )}
      <div className="stat__foot">
        {delta != null && !loading && (
          <span className={cx('stat__delta', delta >= 0 ? 'is-up' : 'is-down')}>
            <Icon name={delta >= 0 ? 'trend-up' : 'trend-down'} size={14} />
            <span className="sr-only">{delta >= 0 ? t('common.increase') : t('common.decrease')}</span>
            {delta >= 0 ? '+' : ''}{formatPercent(delta, 0)}
          </span>
        )}
        {hint && <span className="stat__hint">{hint}</span>}
        {demo && <DemoBadge />}
        {spark && !loading && <span className="stat__spark"><Sparkline values={spark} label={label} /></span>}
      </div>
    </Card>
  );
}

/* — ChartCard : cadre homogène pour tout graphique (états chargement / erreur / vide inclus) — */
export function ChartCard({ title, description, actions, children, loading, error, onRetry, empty, emptyLabel, demo, footer, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; loading?: boolean; error?: string | null; onRetry?: () => void; empty?: boolean; emptyLabel?: string; demo?: boolean; footer?: ReactNode; className?: string }) {
  const t = useT('common');
  return (
    <Card className={cx('chartcard', className)} padding="md">
      <header className="chartcard__head">
        <div>
          <h3 className="chartcard__title">{title}</h3>
          {description && <p className="chartcard__desc">{description}</p>}
        </div>
        <div className="chartcard__actions">{demo && <DemoBadge />}{actions}</div>
      </header>
      <div className="chartcard__body">
        {error ? <ErrorState code={error} onRetry={onRetry} compact /> : loading ? <div className="chartcard__loading" aria-busy="true" aria-label={t('common.loading')}><Skeleton height={180} radius={12} /></div> : empty ? <EmptyState icon="chart" compact title={emptyLabel ?? t('common.noData')} /> : children}
      </div>
      {footer && <footer className="chartcard__foot">{footer}</footer>}
    </Card>
  );
}

/* — DataTable : tri, pagination, états, version « cartes » sous 768 px — */
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  align?: 'start' | 'end';
  width?: string;
  /** Libellé affiché devant la valeur en mode cartes (mobile). */
  mobileLabel?: string;
  /** Colonne principale : titre de la carte en mobile. */
  primary?: boolean;
  /** Masquée en mobile. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  caption: string;
  sort?: { key: string; dir: SortDir };
  onSort?: (key: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
  pagination?: { page: number; pageSize: number; total: number; onChange: (p: number) => void };
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
  demo?: boolean;
}

export function DataTable<T>({ columns, rows, getRowId, caption, sort, onSort, loading, error, onRetry, empty, pagination, onRowClick, selectedId }: DataTableProps<T>) {
  const t = useT('common');
  const colSpan = columns.length;
  return (
    <div className="dtable">
      <div className="dtable__scroll">
        <table className="dtable__table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const sorted = sort?.key === c.key ? sort.dir : null;
                return (
                  <th key={c.key} scope="col" style={{ width: c.width }} className={cx(c.align === 'end' && 'is-end', c.hideOnMobile && 'hide-mobile', c.primary && 'is-primary')} aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined}>
                    {c.sortable && onSort ? (
                      <button type="button" className={cx('dtable__sort', sorted && 'is-sorted')} onClick={() => onSort(c.key)}>
                        {c.header}
                        <Icon name={sorted === 'asc' ? 'arrow-up' : sorted === 'desc' ? 'arrow-down' : 'chevron-down'} size={14} />
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody aria-busy={loading || undefined}>
            {loading && !rows?.length
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={`s${i}`} className="is-skeleton">
                    {columns.map((c) => <td key={c.key} className={c.hideOnMobile ? 'hide-mobile' : undefined}><Skeleton height={14} width={c.align === 'end' ? 50 : '80%'} /></td>)}
                  </tr>
                ))
              : error && !rows?.length
                ? <tr><td colSpan={colSpan}><ErrorState code={error} onRetry={onRetry} compact /></td></tr>
                : rows && rows.length === 0
                  ? <tr><td colSpan={colSpan}>{empty ?? <EmptyState compact icon="search" title={t('common.noResults')} description={t('common.noResultsHint')} />}</td></tr>
                  : rows?.map((row) => {
                      const id = getRowId(row);
                      return (
                        <tr
                          key={id}
                          className={cx(onRowClick && 'is-clickable', selectedId === id && 'is-selected', loading && 'is-stale')}
                          onClick={onRowClick ? () => onRowClick(row) : undefined}
                        >
                          {columns.map((c) => (
                            <td key={c.key} data-label={c.mobileLabel ?? (typeof c.header === 'string' ? c.header : undefined)} className={cx(c.align === 'end' && 'is-end', c.hideOnMobile && 'hide-mobile', c.primary && 'is-primary')}>
                              {c.cell(row)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
          </tbody>
        </table>
      </div>
      {pagination && pagination.total > 0 && <Pagination {...pagination} />}
    </div>
  );
}
