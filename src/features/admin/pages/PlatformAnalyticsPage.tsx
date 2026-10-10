import { ChartCard, PageHeader, Segmented, StatCard } from '@/components/ui';
import { ChartLegend, DonutChart, HBarList, TimeChart } from '@/components/charts/charts';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { MessageKey } from '@/i18n/types';
import { formatCompact, formatDate, formatNumber, formatPercent } from '@/utilities/format';
import { usePresetRange } from '../shared';

export default function PlatformAnalyticsPage() {
  const t = useT('admin', 'common', 'analytics');
  useDocumentTitle(`${t('admin.nav.analytics')} · Admin Center`);
  const { preset, setPreset, range } = usePresetRange('30d');
  const res = useResource(() => api.admin.getOverview(range), [range.from, range.to]);
  const top = useResource(() => api.admin.listProfiles({ page: 1, pageSize: 8, sort: 'views30d', dir: 'desc', filters: { status: 'published' } }), []);
  const o = res.data;
  const loading = res.status === 'loading';
  const err = res.status === 'error' ? res.error : null;
  const x = o ? o.series.map((p) => formatDate(p.date, { day: 'numeric', month: 'short' }, 'UTC')) : [];
  const xl = o ? o.series.map((p) => formatDate(p.date, { dateStyle: 'full' }, 'UTC')) : [];
  const ctr = o && o.kpis.visits ? o.kpis.clicks / o.kpis.visits : 0;
  return (
    <div className="adm-stack">
      <PageHeader title={t('admin.nav.analytics')} description={t('admin.analytics.description')}
        actions={<Segmented label={t('admin.period')} value={preset} onChange={setPreset} options={(['7d', '30d', '90d'] as const).map((p) => ({ value: p, label: t(`analytics.range.${p}` as MessageKey) }))} />} />
      <div className="adm-kpis">
        <StatCard label={t('admin.kpi.visits')} icon="eye" loading={loading} value={o ? formatCompact(o.kpis.visits) : '—'} />
        <StatCard label={t('admin.kpi.clicks')} icon="click" loading={loading} value={o ? formatCompact(o.kpis.clicks) : '—'} />
        <StatCard label={t('analytics.metrics.ctr')} icon="target" loading={loading} value={o ? formatPercent(ctr, 1) : '—'} />
        <StatCard label={t('admin.kpi.newAccounts')} icon="user-check" loading={loading} value={o ? formatNumber(o.kpis.newAccounts) : '—'} />
        <StatCard label={t('admin.kpi.publishedPages')} icon="file" loading={loading} value={o ? formatNumber(o.kpis.publishedPages) : '—'} />
      </div>
      <ChartCard title={t('admin.overview.trafficTitle')} loading={loading} error={err} onRetry={res.reload} footer={<ChartLegend items={[{ label: t('analytics.metrics.views') }, { label: t('analytics.metrics.visitors') }, { label: t('analytics.metrics.clicks') }]} />}>
        {o && <TimeChart label={t('admin.overview.trafficTitle')} x={x} xLong={xl} height={300} series={[{ id: 'v', label: t('analytics.metrics.views'), values: o.series.map((p) => p.views) }, { id: 'u', label: t('analytics.metrics.visitors'), values: o.series.map((p) => p.visitors) }, { id: 'c', label: t('analytics.metrics.clicks'), values: o.series.map((p) => p.clicks) }]} />}
      </ChartCard>
      <div className="adm-grid adm-grid--2">
        <ChartCard title={t('admin.overview.categoriesTitle')} loading={loading} error={err} onRetry={res.reload}>
          {o && <DonutChart label={t('admin.overview.categoriesTitle')} centerLabel={t('admin.kpi.accounts')} items={o.categories.map((c) => ({ label: c.name === 'none' ? t('admin.categoryNone') : t(`common.categories.${c.name as 'creator'}.label`), value: c.value }))} />}
        </ChartCard>
        <ChartCard title={t('admin.analytics.topPages')} loading={top.status === 'loading'} error={top.status === 'error' ? top.error : null} onRetry={top.reload}>
          {top.data && <HBarList items={top.data.items.map((p) => ({ label: `@${p.username}`, value: p.views30d, sub: t(`common.categories.${p.category}.label`) }))} />}
        </ChartCard>
      </div>
    </div>
  );
}
