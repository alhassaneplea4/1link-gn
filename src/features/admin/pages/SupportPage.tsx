import { DataTable, PageHeader, SearchBar, type Column } from '@/components/ui';
import { api } from '@/services/api';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { Ticket } from '@/models/admin';
import { formatRelative } from '@/utilities/format';
import { FilterSelect, StatusBadge, useAdminList } from '../shared';

export default function SupportPage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.support')} · Admin Center`);
  const { q, res, setSearch, setFilter, setPage, setSort } = useAdminList((query) => api.admin.listTickets(query), { sort: 'updatedAt', dir: 'desc' });
  const cols: Column<Ticket>[] = [
    { key: 'id', header: 'ID', hideOnMobile: true, cell: (r) => <span className="mono">{r.id}</span> },
    { key: 'subject', header: t('admin.support.subject'), sortable: true, primary: true, cell: (r) => r.subject },
    { key: 'user', header: t('admin.users.user'), sortable: true, cell: (r) => r.user },
    { key: 'priority', header: t('admin.reports.priority'), sortable: true, cell: (r) => <StatusBadge value={r.priority} label={t(`admin.priority.${r.priority}`)} /> },
    { key: 'status', header: t('admin.users.status'), sortable: true, cell: (r) => <StatusBadge value={r.status} label={t(`admin.support.status.${r.status}`)} /> },
    { key: 'updatedAt', header: t('admin.profiles.updated'), sortable: true, hideOnMobile: true, cell: (r) => formatRelative(r.updatedAt) },
  ];
  return (
    <div>
      <PageHeader title={t('admin.nav.support')} description={t('admin.support.description')} />
      <div className="adm-filters">
        <SearchBar label={t('common.search')} onSearch={setSearch} />
        <FilterSelect label={t('admin.users.status')} value={q.filters?.status} onChange={(v) => setFilter('status', v)} options={(['open', 'pending', 'solved'] as const).map((s) => ({ value: s, label: t(`admin.support.status.${s}`) }))} />
        <FilterSelect label={t('admin.reports.priority')} value={q.filters?.priority} onChange={(v) => setFilter('priority', v)} options={(['high', 'medium', 'low'] as const).map((s) => ({ value: s, label: t(`admin.priority.${s}`) }))} />
      </div>
      <DataTable caption={t('admin.nav.support')} columns={cols} rows={res.data?.items} getRowId={(r) => r.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
        sort={q.sort ? { key: q.sort, dir: q.dir ?? 'asc' } : undefined} onSort={setSort} pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined} />
    </div>
  );
}
