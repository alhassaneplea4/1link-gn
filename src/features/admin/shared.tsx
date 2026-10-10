import { useCallback, useState, type ReactNode } from 'react';
import { Badge, Select, type Tone } from '@/components/ui';
import { useResource, type Resource } from '@/hooks/useResource';
import { useT } from '@/i18n/core';
import type { ListQuery, Paged, SortDir } from '@/models/api';
import type { RangePreset } from '@/models/analytics';
import { useSession } from '@/state/session';
import type { Permission } from '@/models/auth';
import { rangeFromPreset } from '@/features/analytics/ranges';
import { useMemo } from 'react';
import './admin.css';

/** État d'une liste d'administration (recherche, filtres, tri, pagination) + chargement via l'API. */
export function useAdminList<T>(fetcher: (q: ListQuery) => Promise<Paged<T>>, initial: Partial<ListQuery> = {}) {
  const [q, setQ] = useState<ListQuery>({ page: 1, pageSize: 10, ...initial });
  const res: Resource<Paged<T>> = useResource(() => fetcher(q), [JSON.stringify(q)]);
  const setSearch = useCallback((search: string) => setQ((s) => ({ ...s, search, page: 1 })), []);
  const setFilter = useCallback((key: string, value: string) => setQ((s) => ({ ...s, page: 1, filters: { ...s.filters, [key]: value } })), []);
  const setPage = useCallback((page: number) => setQ((s) => ({ ...s, page })), []);
  const setSort = useCallback((key: string) => setQ((s) => ({ ...s, page: 1, sort: key, dir: (s.sort === key && s.dir === 'asc' ? 'desc' : 'asc') as SortDir })), []);
  return { q, res, setSearch, setFilter, setPage, setSort };
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string | undefined; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const t = useT('common');
  return (
    <Select label={label} value={value ?? 'all'} onChange={(e) => onChange(e.target.value)} wrapperClassName="adm-filter">
      <option value="all">{t('common.all')}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}

export function useCanWrite(section: string) {
  return useSession((s) => s.session?.permissions.includes(`${section}:write` as Permission) ?? false);
}

export function ReadOnlyNote() {
  const t = useT('admin');
  return <Badge tone="neutral" icon="lock">{t('admin.readOnly')}</Badge>;
}

export function usePresetRange(initial: Exclude<RangePreset, 'custom'> = '30d') {
  const [preset, setPreset] = useState<Exclude<RangePreset, 'custom'>>(initial);
  const range = useMemo(() => rangeFromPreset(preset), [preset]);
  return { preset, setPreset, range };
}

export const STATUS_TONE: Record<string, Tone> = {
  active: 'success', published: 'success', paid: 'success', solved: 'success', resolved: 'success', operational: 'success', trialing: 'info', in_review: 'info', info: 'info',
  pending: 'warning', open: 'warning', draft: 'neutral', warning: 'warning', past_due: 'warning', degraded: 'warning', medium: 'warning',
  suspended: 'danger', failed: 'danger', canceled: 'neutral', refunded: 'neutral', down: 'danger', critical: 'danger', high: 'danger', dismissed: 'neutral', low: 'neutral', unknown: 'neutral', unavailable: 'danger',
};

export function StatusBadge({ value, label }: { value: string; label: ReactNode }) {
  return <Badge tone={STATUS_TONE[value] ?? 'neutral'} dot>{label}</Badge>;
}
