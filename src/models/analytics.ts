export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface DateRange {
  preset: RangePreset;
  /** ISO date (YYYY-MM-DD) incluse. */
  from: string;
  to: string;
}

export type DataSourceKind = 'demo' | 'live';

export interface SeriesPoint { date: string; views: number; visitors: number; clicks: number }
export interface TopLink { blockId: string; label: string; clicks: number; ctr: number }
export interface Share { name: string; value: number }

export interface AnalyticsReport {
  source: DataSourceKind;
  range: DateRange;
  totals: { views: number; visitors: number; clicks: number; ctr: number };
  /** Variation par rapport à la période précédente (ratio, ex. 0.12 = +12 %). null si non calculable. */
  deltas: { views: number | null; visitors: number | null; clicks: number | null; ctr: number | null };
  series: SeriesPoint[];
  topLinks: TopLink[];
  sources: Share[];
  devices: Share[];
  countries: Share[];
  /** La géolocalisation est approximative (déduite de l'IP) : à signaler dans l'interface. */
  geoApproximate: boolean;
}
