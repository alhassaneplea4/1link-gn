import { ChartCard, DataTable, DemoBadge, PageHeader, SearchBar, type Column } from '@/components/ui';
import { DonutChart } from '@/components/charts/charts';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { SubscriptionRow } from '@/models/admin';
import { formatDate } from '@/utilities/format';
import { usePresetRange, FilterSelect, StatusBadge, useAdminList } from '../shared';

export default function SubscriptionsPage() {
  const t = useT('admin', 'common', 'dashboard');
  useDocumentTitle(`${t('admin.nav.subscriptions')} · Admin Center`);
  const { range } = usePresetRange('30d');
  const ov = useResource(() => api.admin.getOverview(range), [range.from, range.to]);
  const { q, res, setSearch, setFilter, setPage, setSort } = useAdminList((query) => api.admin.listSubscriptions(query), { sort: 'startedAt', dir: 'desc' });
  const cols: Column<SubscriptionRow>[] = [
    { key: 'id', header: 'ID', cell: (s) => <span className="mono">{s.id}</span>, hideOnMobile: true },
    { key: 'user', header: t('admin.users.user'), sortable: true, primary: true, cell: (s) => s.user },
    { key: 'plan', header: t('admin.users.plan'), sortable: true, cell: (s) => t(`common.plans.${s.plan}`) },
    { key: 'status', header: t('admin.users.status'), sortable: true, cell: (s) => <StatusBadge value={s.status} label={t(`dashboard.overview.subStatus.${s.status}`)} /> },
    { key: 'startedAt', header: t('admin.subs.started'), sortable: true, hideOnMobile: true, cell: (s) => formatDate(s.startedAt) },
    { key: 'renewsAt', header: t('admin.subs.renews'), sortable: true, cell: (s) => (s.renewsAt ? formatDate(s.renewsAt) : '—') },
  ];
  return (
    <div className="adm-stack">
      <PageHeader title={t('admin.nav.subscriptions')} description={t('admin.subs.description')} badge={<DemoBadge />} />
      <ChartCard title={t('admin.subs.distribution')} loading={ov.status === 'loading'} error={ov.status === 'error' ? ov.error : null} onRetry={ov.reload} demo>
        {ov.data && <DonutChart label={t('admin.subs.distribution')} centerLabel={t('admin.kpi.accounts')} items={ov.data.plans.map((p) => ({ label: t(`common.plans.${p.name as 'free'}`), value: p.value }))} />}
      </ChartCard>
      <div>
        <div className="adm-filters">
          <SearchBar label={t('common.search')} onSearch={setSearch} />
          <FilterSelect label={t('admin.users.plan')} value={q.filters?.plan} onChange={(v) => setFilter('plan', v)} options={(['pro', 'business'] as const).map((p) => ({ value: p, label: t(`common.plans.${p}`) }))} />
          <FilterSelect label={t('admin.users.status')} value={q.filters?.status} onChange={(v) => setFilter('status', v)} options={(['active', 'trialing', 'past_due', 'canceled'] as const).map((s) => ({ value: s, label: t(`dashboard.overview.subStatus.${s}`) }))} />
        </div>
        <DataTable caption={t('admin.nav.subscriptions')} columns={cols} rows={res.data?.items} getRowId={(s) => s.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
          sort={q.sort ? { key: q.sort, dir: q.dir ?? 'asc' } : undefined} onSort={setSort} pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined} />
      </div>
    </div>
  );
}
