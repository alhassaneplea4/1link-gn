import type { AnalyticsReport, SeriesPoint } from '@/models/analytics';
import { blockSummary } from '@/features/page-engine/blocks/registry';
import type { AnalyticsApi } from '../types';
import { addDays, hashSeed, isoDay, rng } from './prng';
import { delay, readDb } from './db';
import { requireDemoUser } from './auth';

const SOURCES = ['WhatsApp', 'Instagram', 'TikTok', 'Facebook', 'Direct', 'Autres'];
const DEVICES = ['Mobile', 'Ordinateur', 'Tablette'];
const COUNTRIES = ['Guinée', 'Sénégal', 'Côte d’Ivoire', 'France', 'Mali', 'Autres'];

function normalize(weights: number[], names: string[], total: number) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return names.map((name, i) => ({ name, value: Math.round((weights[i]! / sum) * total) }));
}

/** Génère des séries plausibles mais ENTIÈREMENT FICTIVES (source = « demo ») à partir du pseudonyme et de la période. */
export function buildDemoReport(seedKey: string, from: string, to: string, linkLabels: { id: string; label: string }[], preset: AnalyticsReport['range']['preset']): AnalyticsReport {
  const r = rng(hashSeed(seedKey));
  const series: SeriesPoint[] = [];
  const hourly = from === to;
  if (hourly) {
    for (let h = 0; h < 24; h++) {
      const base = Math.max(0, Math.sin(((h - 6) / 24) * Math.PI * 2) * 0.5 + 0.55);
      const views = Math.round(base * r.int(4, 16));
      series.push({ date: `${from}T${String(h).padStart(2, '0')}:00`, views, visitors: Math.round(views * 0.78), clicks: Math.round(views * (0.3 + r.next() * 0.2)) });
    }
  } else {
    const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1;
    const start = new Date(from);
    const trend = 0.6 + r.next() * 0.5;
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      const weekday = d.getUTCDay();
      const weekend = weekday === 0 || weekday === 6 ? 0.85 : 1.1;
      const growth = 0.7 + (i / Math.max(1, days - 1)) * trend * 0.6;
      const spike = r.chance(0.06) ? r.int(2, 4) : 1;
      const views = Math.round((18 + r.next() * 22) * weekend * growth * spike);
      series.push({ date: isoDay(d), views, visitors: Math.round(views * (0.7 + r.next() * 0.1)), clicks: Math.round(views * (0.28 + r.next() * 0.18)) });
    }
  }
  const sum = (k: keyof Omit<SeriesPoint, 'date'>) => series.reduce((a, p) => a + p[k], 0);
  const views = sum('views');
  const visitors = sum('visitors');
  const clicks = sum('clicks');
  const w = linkLabels.map(() => 0.3 + r.next());
  const wSum = w.reduce((a, b) => a + b, 0) || 1;
  const topLinks = linkLabels
    .map((l, i) => {
      const c = Math.round((w[i]! / wSum) * clicks);
      return { blockId: l.id, label: l.label, clicks: c, ctr: views ? c / views : 0 };
    })
    .sort((a, b) => b.clicks - a.clicks);
  const delta = () => (r.next() - 0.35) * 0.5;
  return {
    source: 'demo',
    range: { preset, from, to },
    totals: { views, visitors, clicks, ctr: views ? clicks / views : 0 },
    deltas: { views: delta(), visitors: delta(), clicks: delta(), ctr: delta() / 2 },
    series,
    topLinks,
    sources: normalize([r.int(30, 50), r.int(15, 30), r.int(12, 28), r.int(5, 12), r.int(6, 14), r.int(2, 6)], SOURCES, visitors).sort((a, b) => b.value - a.value),
    devices: normalize([r.int(72, 90), r.int(8, 22), r.int(1, 6)], DEVICES, visitors),
    countries: normalize([r.int(55, 72), r.int(6, 14), r.int(5, 12), r.int(4, 10), r.int(3, 8), r.int(2, 6)], COUNTRIES, visitors).sort((a, b) => b.value - a.value),
    geoApproximate: true,
  };
}

export const demoAnalytics: AnalyticsApi = {
  async getReport(range) {
    const u = requireDemoUser();
    const page = readDb().pages[u.id];
    const links = (page?.blocks ?? [])
      .filter((b) => ['link', 'cta', 'social', 'whatsapp', 'email', 'phone', 'service', 'portfolio'].includes(b.type) && b.visible)
      .map((b) => ({ id: b.id, label: blockSummary(b) || b.type }));
    return delay(buildDemoReport(`${u.id}:${range.from}:${range.to}`, range.from, range.to, links, range.preset), 420);
  },
};
