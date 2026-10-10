import { Link } from 'react-router-dom';
import { Badge, DataTable, DemoBadge, PageHeader, SearchBar, Tabs, type Column } from '@/components/ui';
import VerificationsPanel from './VerificationsPanel';
import { api } from '@/services/api';
import { useDocumentTitle } from '@/hooks/dom';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import { CATEGORY_IDS } from '@/models/category';
import type { AdminProfileRow } from '@/models/admin';
import { formatNumber, formatRelative } from '@/utilities/format';
import { FilterSelect, StatusBadge, useAdminList } from '../shared';

function PagesPanel() {
  const t = useT('admin', 'common');
  const { q, res, setSearch, setFilter, setPage, setSort } = useAdminList((query) => api.admin.listProfiles(query), { sort: 'views30d', dir: 'desc' });
  const cols: Column<AdminProfileRow>[] = [
    { key: 'username', header: t('admin.profiles.page'), sortable: true, primary: true, cell: (p) => <span><strong>@{p.username}</strong><br /><small className="subtle">{p.owner}</small></span> },
    { key: 'category', header: t('admin.users.category'), sortable: true, cell: (p) => t(`common.categories.${p.category}.label`) },
    { key: 'status', header: t('admin.users.status'), sortable: true, cell: (p) => <StatusBadge value={p.status} label={t(`common.status.${p.status}`)} /> },
    { key: 'blocks', header: t('admin.profiles.blocks'), sortable: true, align: 'end', hideOnMobile: true, cell: (p) => formatNumber(p.blocks) },
    { key: 'views30d', header: t('admin.profiles.views30'), sortable: true, align: 'end', cell: (p) => formatNumber(p.views30d) },
    { key: 'reports', header: t('admin.profiles.reports'), sortable: true, align: 'end', cell: (p) => (p.reports > 0 ? <Badge tone="danger" icon="flag">{p.reports}</Badge> : '—') },
    { key: 'updatedAt', header: t('admin.profiles.updated'), sortable: true, hideOnMobile: true, cell: (p) => formatRelative(p.updatedAt) },
    { key: 'actions', header: <span className="sr-only">{t('common.actions')}</span>, mobileLabel: t('common.actions'), align: 'end', cell: (p) => (
      <span className="cell-actions">
        {p.reports > 0 && <Link className="btn btn--secondary btn--sm" to={`${paths.admin.reports}?q=${p.username}`}><span className="btn__label">{t('admin.profiles.seeReports')}</span></Link>}
      </span>
    ) },
  ];
  return (
    <div>
      <div className="adm-filters">
        <SearchBar label={t('common.search')} placeholder={t('admin.profiles.searchPlaceholder')} onSearch={setSearch} />
        <FilterSelect label={t('admin.users.status')} value={q.filters?.status} onChange={(v) => setFilter('status', v)} options={(['published', 'draft', 'suspended'] as const).map((s) => ({ value: s, label: t(`common.status.${s}`) }))} />
        <FilterSelect label={t('admin.users.category')} value={q.filters?.category} onChange={(v) => setFilter('category', v)} options={CATEGORY_IDS.map((c) => ({ value: c, label: t(`common.categories.${c}.label`) }))} />
      </div>
      <DataTable
        caption={t('admin.nav.profiles')} columns={cols} rows={res.data?.items} getRowId={(p) => p.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
        sort={q.sort ? { key: q.sort, dir: q.dir ?? 'asc' } : undefined} onSort={setSort} pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined}
      />
    </div>
  );
}

export default function ProfilesPage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.profiles')} · Admin Center`);
  return (
    <div>
      <PageHeader title={t('admin.nav.profiles')} description={t('admin.profiles.description')} badge={<DemoBadge />} />
      <Tabs variant="pills" label={t('admin.nav.profiles')} items={[
        { id: 'pages', label: t('admin.verification.pagesTab'), icon: 'file', panel: <PagesPanel /> },
        { id: 'verifications', label: t('admin.verification.tab'), icon: 'shield-check', panel: <VerificationsPanel /> },
      ]} />
    </div>
  );
}
