import { Link } from 'react-router-dom';
import { Alert, ChartCard, DataTable, PageHeader, Segmented, StatCard, type Column } from '@/components/ui';
import { ChartLegend, DonutChart, TimeChart } from '@/components/charts/charts';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import type { Report } from '@/models/admin';
import type { MessageKey } from '@/i18n/types';
import { formatCompact, formatCurrency, formatDate, formatNumber, formatRelative } from '@/utilities/format';
import { StatusBadge, usePresetRange } from '../shared';

const PRESETS = ['7d', '30d', '90d'] as const;

export default function AdminOverviewPage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.overview')} · Admin Center`);
  const { preset, setPreset, range } = usePresetRange('30d');
  const res = useResource(() => api.admin.getOverview(range), [range.from, range.to]);
  const reports = useResource(() => api.admin.listReports({ page: 1, pageSize: 5, filters: { status: 'open' }, sort: 'createdAt', dir: 'desc' }), []);
  const o = res.data;
  const loading = res.status === 'loading';
  const k = o?.kpis;
  const x = o ? o.series.map((p) => formatDate(p.date, { day: 'numeric', month: 'short' }, 'UTC')) : [];
  const xl = o ? o.series.map((p) => formatDate(p.date, { dateStyle: 'full' }, 'UTC')) : [];

  const cols: Column<Report>[] = [
    { key: 'username', header: t('admin.reports.profile'), primary: true, cell: (r) => <Link to={`${paths.admin.moderation}?report=${r.id}`}>@{r.username}</Link> },
    { key: 'reason', header: t('admin.reports.reason'), cell: (r) => t(`admin.reasons.${r.reason}`) },
    { key: 'priority', header: t('admin.reports.priority'), cell: (r) => <StatusBadge value={r.priority} label={t(`admin.priority.${r.priority}`)} /> },
    { key: 'createdAt', header: t('admin.reports.date'), hideOnMobile: true, cell: (r) => formatRelative(r.createdAt) },
  ];

  return (
    <div>
      <PageHeader title={t('admin.nav.overview')} description={t('admin.overview.description')}
        actions={<Segmented label={t('admin.period')} value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ value: p, label: t(`analytics.range.${p}` as MessageKey) }))} />} />
      {res.status === 'error' && <Alert tone="danger" title={t('common.errors.title')} action={<button className="btn btn--secondary btn--sm" onClick={res.reload}><span className="btn__label">{t('common.retry')}</span></button>}>{t('common.errors.generic')}</Alert>}

      <div className="adm-kpis" style={{ marginTop: 'var(--space-4)' }}>
        <StatCard label={t('admin.kpi.users')} icon="users" loading={loading} value={k ? formatNumber(k.users) : '—'} />
        <StatCard label={t('admin.kpi.activeUsers')} icon="user-check" loading={loading} value={k ? formatNumber(k.activeUsers) : '—'} />
        <StatCard label={t('admin.kpi.newAccounts')} icon="plus" loading={loading} value={k ? formatNumber(k.newAccounts) : '—'} hint={t('admin.kpi.inPeriod')} />
        <StatCard label={t('admin.kpi.publishedPages')} icon="file" loading={loading} value={k ? formatNumber(k.publishedPages) : '—'} />
        <StatCard label={t('admin.kpi.visits')} icon="eye" loading={loading} value={k ? formatCompact(k.visits) : '—'} hint={t('admin.kpi.inPeriod')} />
        <StatCard label={t('admin.kpi.clicks')} icon="click" loading={loading} value={k ? formatCompact(k.clicks) : '—'} hint={t('admin.kpi.inPeriod')} />
        <StatCard label={t('admin.kpi.subscriptions')} icon="credit-card" loading={loading} value={k ? formatNumber(k.subscriptions) : '—'} />
        <StatCard label={t('admin.kpi.revenue')} icon="wallet" loading={loading} value={k && o ? formatCurrency(k.revenue, o.currency) : '—'} hint={t('admin.kpi.revenueHint')} />
        <StatCard label={t('admin.kpi.reports')} icon="flag" loading={loading} value={k ? formatNumber(k.reports) : '—'} hint={t('admin.kpi.toProcess')} />
        <StatCard label={t('admin.kpi.errors')} icon="bug" loading={loading} value={k ? formatNumber(k.errors) : '—'} hint={t('admin.kpi.inPeriod')} />
      </div>

      <div className="adm-grid adm-grid--2-1">
        <ChartCard title={t('admin.overview.trafficTitle')} loading={loading} error={res.status === 'error' ? res.error : null} onRetry={res.reload} footer={<ChartLegend items={[{ label: t('analytics.metrics.views') }, { label: t('analytics.metrics.clicks') }]} />}>
          {o && <TimeChart label={t('admin.overview.trafficTitle')} x={x} xLong={xl} height={260} series={[{ id: 'v', label: t('analytics.metrics.views'), values: o.series.map((p) => p.views) }, { id: 'c', label: t('analytics.metrics.clicks'), values: o.series.map((p) => p.clicks) }]} />}
        </ChartCard>
        <ChartCard title={t('admin.overview.categoriesTitle')} loading={loading} error={res.status === 'error' ? res.error : null} onRetry={res.reload}>
          {o && <DonutChart label={t('admin.overview.categoriesTitle')} centerLabel={t('admin.kpi.accounts')} items={o.categories.map((c) => ({ label: c.name === 'none' ? t('admin.categoryNone') : t(`common.categories.${c.name as 'creator'}.label`), value: c.value }))} />}
        </ChartCard>
      </div>
      <div className="adm-grid adm-grid--2">
        <ChartCard title={t('admin.overview.signupsTitle')} loading={loading} error={res.status === 'error' ? res.error : null} onRetry={res.reload}>
          {o && <TimeChart kind="bar" label={t('admin.overview.signupsTitle')} x={x} xLong={xl} height={220} series={[{ id: 's', label: t('admin.kpi.newAccounts'), values: o.signups.map((p) => p.value) }]} />}
        </ChartCard>
        <div>
          <h2 className="adm-section-title">{t('admin.overview.openReports')}</h2>
          <DataTable caption={t('admin.overview.openReports')} columns={cols} rows={reports.data?.items} getRowId={(r) => r.id} loading={reports.status === 'loading'} error={reports.status === 'error' ? reports.error : null} onRetry={reports.reload} />
        </div>
      </div>
    </div>
  );
}
