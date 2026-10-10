import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable, DemoBadge, PageHeader, SearchBar, type Column } from '@/components/ui';
import { api } from '@/services/api';
import { useDocumentTitle } from '@/hooks/dom';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import type { Report } from '@/models/admin';
import { formatDateTime } from '@/utilities/format';
import { FilterSelect, StatusBadge, useAdminList } from '../shared';

export const REASONS = ['spam', 'impersonation', 'inappropriate', 'scam', 'copyright', 'other'] as const;
export const REPORT_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const;

export default function ReportsPage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.reports')} · Admin Center`);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialSearch = params.get('q') ?? '';
  const { q, res, setSearch, setFilter, setPage, setSort } = useAdminList((query) => api.admin.listReports(query), { sort: 'createdAt', dir: 'desc', search: initialSearch });
  const cols: Column<Report>[] = [
    { key: 'id', header: 'ID', hideOnMobile: true, cell: (r) => <span className="mono">{r.id}</span> },
    { key: 'username', header: t('admin.reports.profile'), sortable: true, primary: true, cell: (r) => <strong>@{r.username}</strong> },
    { key: 'reason', header: t('admin.reports.reason'), sortable: true, cell: (r) => t(`admin.reasons.${r.reason}`) },
    { key: 'priority', header: t('admin.reports.priority'), sortable: true, cell: (r) => <StatusBadge value={r.priority} label={t(`admin.priority.${r.priority}`)} /> },
    { key: 'status', header: t('admin.users.status'), sortable: true, cell: (r) => <StatusBadge value={r.status} label={t(`admin.reportStatus.${r.status}`)} /> },
    { key: 'createdAt', header: t('admin.reports.date'), sortable: true, hideOnMobile: true, cell: (r) => formatDateTime(r.createdAt) },
  ];
  return (
    <div>
      <PageHeader title={t('admin.nav.reports')} description={t('admin.reports.description')} badge={<DemoBadge />} />
      <div className="adm-filters">
        <SearchBar label={t('common.search')} placeholder={t('admin.reports.searchPlaceholder')} onSearch={setSearch} defaultValue={initialSearch} />
        <FilterSelect label={t('admin.users.status')} value={q.filters?.status} onChange={(v) => setFilter('status', v)} options={REPORT_STATUSES.map((s) => ({ value: s, label: t(`admin.reportStatus.${s}`) }))} />
        <FilterSelect label={t('admin.reports.reason')} value={q.filters?.reason} onChange={(v) => setFilter('reason', v)} options={REASONS.map((s) => ({ value: s, label: t(`admin.reasons.${s}`) }))} />
        <FilterSelect label={t('admin.reports.priority')} value={q.filters?.priority} onChange={(v) => setFilter('priority', v)} options={(['high', 'medium', 'low'] as const).map((s) => ({ value: s, label: t(`admin.priority.${s}`) }))} />
      </div>
      <DataTable caption={t('admin.nav.reports')} columns={cols} rows={res.data?.items} getRowId={(r) => r.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
        sort={q.sort ? { key: q.sort, dir: q.dir ?? 'asc' } : undefined} onSort={setSort} onRowClick={(r) => navigate(`${paths.admin.moderation}?report=${r.id}`)}
        pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined} />
    </div>
  );
}
