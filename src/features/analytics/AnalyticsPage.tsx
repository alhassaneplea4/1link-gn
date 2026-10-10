import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, ChartCard, EmptyState, Input, PageHeader, Segmented, StatCard } from '@/components/ui';
import { ChartLegend, DonutChart, HBarList, TimeChart } from '@/components/charts/charts';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import type { AnalyticsReport, DateRange, RangePreset } from '@/models/analytics';
import { useSession } from '@/state/session';
import { formatCompact, formatDate, formatNumber, formatPercent } from '@/utilities/format';
import { customRange, isoDay, rangeDays, rangeFromPreset } from './ranges';
import './analytics.css';

const PRESETS: Exclude<RangePreset, 'custom'>[] = ['today', '7d', '30d', '90d'];

function labels(report: AnalyticsReport) {
  const hourly = report.range.from === report.range.to;
  const short = report.series.map((p) => (hourly ? p.date.slice(11, 16) : formatDate(p.date, { day: 'numeric', month: 'short' }, 'UTC')));
  const long = report.series.map((p) => (hourly ? `${formatDate(report.range.from, { dateStyle: 'medium' }, 'UTC')} · ${p.date.slice(11, 16)}` : formatDate(p.date, { dateStyle: 'full' }, 'UTC')));
  return { short, long };
}

function downloadCsv(report: AnalyticsReport, header: string[]) {
  const rows = [header.join(','), ...report.series.map((p) => [p.date, p.views, p.visitors, p.clicks].join(','))];
  const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `1link-analytics-${report.range.from}_${report.range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const t = useT('analytics', 'common');
  useDocumentTitle(`${t('analytics.title')} · 1Link`);
  const entitlements = useSession((s) => s.session?.entitlements);
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [custom, setCustom] = useState({ from: isoDay(new Date(Date.now() - 13 * 86_400_000)), to: isoDay(new Date()) });
  const [kind, setKind] = useState<'line' | 'bar'>('line');
  const today = isoDay(new Date());
  const customError = preset === 'custom' ? (custom.from > custom.to ? t('analytics.range.invalidOrder') : custom.to > today ? t('analytics.range.future') : rangeDays(customRange(custom.from, custom.to)) > 366 ? t('analytics.range.tooLong') : undefined) : undefined;
  const range: DateRange = useMemo(() => (preset === 'custom' ? customRange(custom.from, custom.to) : rangeFromPreset(preset)), [preset, custom]);
  const enabled = !customError;
  const res = useResource(() => (enabled ? api.analytics.getReport(range) : Promise.reject(new Error('invalid'))), [range.from, range.to, enabled]);
  const report = res.data;
  const lab = useMemo(() => (report ? labels(report) : null), [report]);
  const tooLongForPlan = entitlements && rangeDays(range) > entitlements.analyticsDays;
  const empty = report ? report.totals.views === 0 && report.totals.clicks === 0 : false;
  const loading = res.status === 'loading' && enabled;
  const err = res.status === 'error' && enabled ? res.error : null;

  return (
    <div className="an">
      <PageHeader
        title={t('analytics.title')} description={t('analytics.subtitle')}
        actions={report && !empty ? <Button variant="secondary" iconLeft="download" onClick={() => downloadCsv(report, [t('analytics.csv.date'), t('analytics.metrics.views'), t('analytics.metrics.visitors'), t('analytics.metrics.clicks')])}>{t('analytics.export')}</Button> : undefined}
      />

      <div className="an-filters">
        <Segmented label={t('analytics.range.label')} value={preset} onChange={setPreset} options={[...PRESETS.map((p) => ({ value: p as RangePreset, label: t(`analytics.range.${p}`) })), { value: 'custom' as RangePreset, label: t('analytics.range.custom') }]} />
        {preset === 'custom' && (
          <div className="an-filters__custom">
            <Input label={t('analytics.range.from')} type="date" max={today} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <Input label={t('analytics.range.to')} type="date" max={today} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} error={customError} />
          </div>
        )}
        {res.refreshing && <span className="subtle an-filters__refresh" role="status">{t('common.loading')}</span>}
      </div>

      {tooLongForPlan && <Alert tone="info" className="an-alert" action={<Link className="btn btn--secondary btn--sm" to={paths.dashboard.subscription}><span className="btn__label">{t('analytics.planLimit.cta')}</span></Link>}>{t('analytics.planLimit.text', { days: entitlements!.analyticsDays })}</Alert>}

      {empty && !loading ? (
        <EmptyState icon="chart" title={t('analytics.empty.title')} description={t('analytics.empty.text')} />
      ) : (
        <>
          <div className="stats an-stats">
            <StatCard label={t('analytics.metrics.views')} icon="eye" loading={loading} value={report ? formatNumber(report.totals.views) : '—'} delta={report?.deltas.views} spark={report?.series.map((p) => p.views)} />
            <StatCard label={t('analytics.metrics.visitors')} icon="users" loading={loading} value={report ? formatNumber(report.totals.visitors) : '—'} delta={report?.deltas.visitors} hint={t('analytics.metrics.visitorsHint')} />
            <StatCard label={t('analytics.metrics.clicks')} icon="click" loading={loading} value={report ? formatNumber(report.totals.clicks) : '—'} delta={report?.deltas.clicks} spark={report?.series.map((p) => p.clicks)} />
            <StatCard label={t('analytics.metrics.ctr')} icon="target" loading={loading} value={report ? formatPercent(report.totals.ctr, 1) : '—'} delta={report?.deltas.ctr} hint={t('analytics.metrics.ctrHint')} />
          </div>

          <ChartCard
            className="an-main" title={t('analytics.evolution')} description={report ? `${formatDate(report.range.from, { dateStyle: 'medium' }, 'UTC')} → ${formatDate(report.range.to, { dateStyle: 'medium' }, 'UTC')}` : undefined}
            loading={loading} error={err} onRetry={res.reload}
            actions={<Segmented size="sm" label={t('analytics.chartType')} value={kind} onChange={setKind} options={[{ value: 'line', label: t('analytics.line'), icon: 'activity' }, { value: 'bar', label: t('analytics.bars'), icon: 'chart' }]} />}
            footer={<ChartLegend items={[{ label: t('analytics.metrics.views') }, { label: t('analytics.metrics.visitors') }, { label: t('analytics.metrics.clicks') }]} />}
          >
            {report && lab && <TimeChart kind={kind} label={t('analytics.evolution')} x={lab.short} xLong={lab.long} height={280} series={[{ id: 'views', label: t('analytics.metrics.views'), values: report.series.map((p) => p.views) }, { id: 'visitors', label: t('analytics.metrics.visitors'), values: report.series.map((p) => p.visitors) }, { id: 'clicks', label: t('analytics.metrics.clicks'), values: report.series.map((p) => p.clicks) }]} />}
          </ChartCard>

          <div className="an-cols">
            <ChartCard title={t('analytics.topLinks')} description={t('analytics.topLinksDesc')} loading={loading} error={err} onRetry={res.reload} empty={report?.topLinks.length === 0} emptyLabel={t('analytics.noLinks')}>
              {report && <HBarList items={report.topLinks.slice(0, 6).map((l) => ({ label: l.label, value: l.clicks, sub: `${t('analytics.metrics.ctr')} ${formatPercent(l.ctr, 1)}` }))} />}
            </ChartCard>
            <ChartCard title={t('analytics.sources')} description={t('analytics.sourcesDesc')} loading={loading} error={err} onRetry={res.reload}>
              {report && <HBarList showShare items={report.sources.map((s) => ({ label: s.name, value: s.value }))} />}
            </ChartCard>
            <ChartCard title={t('analytics.devices')} loading={loading} error={err} onRetry={res.reload}>
              {report && <DonutChart label={t('analytics.devices')} centerLabel={t('analytics.metrics.visitors')} items={report.devices.map((d) => ({ label: d.name, value: d.value }))} />}
            </ChartCard>
            <ChartCard title={t('analytics.countries')} description={report?.geoApproximate ? t('analytics.geoApprox') : undefined} loading={loading} error={err} onRetry={res.reload} footer={report?.geoApproximate ? <span>{t('analytics.geoNote')}</span> : undefined}>
              {report && <HBarList showShare items={report.countries.map((c) => ({ label: c.name, value: c.value }))} />}
            </ChartCard>
          </div>
          {report && <p className="subtle an-foot">{t('analytics.visitorsNote', { n: formatCompact(report.totals.visitors) })}</p>}
        </>
      )}
    </div>
  );
}
