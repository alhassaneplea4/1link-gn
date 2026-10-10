import { DataTable, PageHeader, SearchBar, type Column } from '@/components/ui';
import { api } from '@/services/api';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { AuditLog } from '@/models/admin';
import { formatDateTime } from '@/utilities/format';
import { FilterSelect, StatusBadge, useAdminList } from '../shared';

export default function LogsPage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.logs')} · Admin Center`);
  const { q, res, setSearch, setFilter, setPage, setSort } = useAdminList((query) => api.admin.listAuditLogs(query), { sort: 'at', dir: 'desc' });
  const cols: Column<AuditLog>[] = [
    { key: 'at', header: t('admin.logs.date'), sortable: true, cell: (l) => formatDateTime(l.at) },
    { key: 'actor', header: t('admin.logs.actor'), sortable: true, primary: true, cell: (l) => l.actor },
    { key: 'action', header: t('admin.logs.action'), sortable: true, cell: (l) => <code className="mono">{l.action}</code> },
    { key: 'target', header: t('admin.logs.target'), hideOnMobile: true, cell: (l) => l.target },
    { key: 'ip', header: 'IP', hideOnMobile: true, cell: (l) => <span className="mono">{l.ip}</span> },
    { key: 'level', header: t('admin.logs.level'), sortable: true, align: 'end', cell: (l) => <StatusBadge value={l.level} label={t(`admin.levels.${l.level}`)} /> },
  ];
  return (
    <div>
      <PageHeader title={t('admin.nav.logs')} description={t('admin.logs.description')} />
      <div className="adm-filters">
        <SearchBar label={t('common.search')} placeholder={t('admin.logs.searchPlaceholder')} onSearch={setSearch} />
        <FilterSelect label={t('admin.logs.level')} value={q.filters?.level} onChange={(v) => setFilter('level', v)} options={(['info', 'warning', 'critical'] as const).map((l) => ({ value: l, label: t(`admin.levels.${l}`) }))} />
      </div>
      <DataTable caption={t('admin.nav.logs')} columns={cols} rows={res.data?.items} getRowId={(l) => l.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
        sort={q.sort ? { key: q.sort, dir: q.dir ?? 'asc' } : undefined} onSort={setSort} pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined} />
    </div>
  );
}
