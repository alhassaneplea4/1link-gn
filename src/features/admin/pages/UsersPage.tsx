import { useNavigate } from 'react-router-dom';
import { Avatar, DataTable, DemoBadge, PageHeader, SearchBar, type Column } from '@/components/ui';
import { api } from '@/services/api';
import { useDocumentTitle } from '@/hooks/dom';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import { CATEGORY_IDS } from '@/models/category';
import type { AdminUserRow } from '@/models/admin';
import { formatDate, formatRelative } from '@/utilities/format';
import { FilterSelect, StatusBadge, useAdminList } from '../shared';

export default function UsersPage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.users')} · Admin Center`);
  const navigate = useNavigate();
  const { q, res, setSearch, setFilter, setPage, setSort } = useAdminList((query) => api.admin.listUsers(query), { sort: 'createdAt', dir: 'desc' });
  const cols: Column<AdminUserRow>[] = [
    { key: 'name', header: t('admin.users.user'), sortable: true, primary: true, cell: (u) => <span className="cell-type"><Avatar name={u.name} size={32} /><span><strong>{u.name}</strong><br /><small className="subtle">{u.email}</small></span></span> },
    { key: 'category', header: t('admin.users.category'), sortable: true, cell: (u) => t(`common.categories.${u.category}.label`) },
    { key: 'plan', header: t('admin.users.plan'), sortable: true, cell: (u) => t(`common.plans.${u.plan}`) },
    { key: 'status', header: t('admin.users.status'), sortable: true, cell: (u) => <StatusBadge value={u.status} label={t(`common.status.${u.status}`)} /> },
    { key: 'createdAt', header: t('admin.users.joined'), sortable: true, hideOnMobile: true, cell: (u) => formatDate(u.createdAt) },
    { key: 'lastActiveAt', header: t('admin.users.activity'), sortable: true, hideOnMobile: true, cell: (u) => formatRelative(u.lastActiveAt) },
  ];
  return (
    <div>
      <PageHeader title={t('admin.nav.users')} description={t('admin.users.description')} badge={<DemoBadge />} />
      <div className="adm-filters">
        <SearchBar label={t('common.search')} placeholder={t('admin.users.searchPlaceholder')} onSearch={setSearch} />
        <FilterSelect label={t('admin.users.category')} value={q.filters?.category} onChange={(v) => setFilter('category', v)} options={CATEGORY_IDS.map((c) => ({ value: c, label: t(`common.categories.${c}.label`) }))} />
        <FilterSelect label={t('admin.users.plan')} value={q.filters?.plan} onChange={(v) => setFilter('plan', v)} options={(['free', 'pro', 'business'] as const).map((p) => ({ value: p, label: t(`common.plans.${p}`) }))} />
        <FilterSelect label={t('admin.users.status')} value={q.filters?.status} onChange={(v) => setFilter('status', v)} options={(['active', 'pending', 'suspended'] as const).map((s) => ({ value: s, label: t(`common.status.${s}`) }))} />
      </div>
      <DataTable
        caption={t('admin.nav.users')} columns={cols} rows={res.data?.items} getRowId={(u) => u.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
        sort={q.sort ? { key: q.sort, dir: q.dir ?? 'asc' } : undefined} onSort={setSort} onRowClick={(u) => navigate(paths.admin.user(u.id))}
        pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined}
      />
    </div>
  );
}
