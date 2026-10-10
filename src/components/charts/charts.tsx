import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useElementWidth } from '@/hooks/dom';
import { formatNumber } from '@/utilities/format';
import { cx } from '@/utilities/misc';

export const seriesColor = (i: number) => `var(--chart-${(i % 6) + 1})`;

export interface ChartSeries {
  id: string;
  label: string;
  values: number[];
}

function niceMax(max: number): number {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

interface TimeChartProps {
  series: ChartSeries[];
  /** Libellés courts de l'axe X. */
  x: string[];
  /** Libellés complets (infobulle). */
  xLong?: string[];
  kind?: 'line' | 'bar';
  height?: number;
  /** Description accessible du graphique. */
  label: string;
  format?: (n: number) => string;
  className?: string;
}

/**
 * Graphique temporel SVG (lignes ou barres) : axe unique, grille discrète, marques fines,
 * infobulle au survol ET au clavier (flèches), tableau de données équivalent pour les lecteurs d'écran.
 */
export function TimeChart({ series, x, xLong, kind = 'line', height = 240, label, format = (n) => formatNumber(n), className }: TimeChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrap, 640);
  const [active, setActive] = useState<number | null>(null);
  const gid = useId();
  const m = { t: 14, r: 12, b: 28, l: 44 };
  const w = Math.max(240, width);
  const iw = w - m.l - m.r;
  const ih = height - m.t - m.b;
  const n = x.length;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const px = (i: number) => m.l + (kind === 'bar' ? ((i + 0.5) / n) * iw : n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const py = (v: number) => m.t + ih - (v / max) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 72))));

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * w - m.l;
    const i = kind === 'bar' ? Math.floor((rel / iw) * n) : Math.round((rel / iw) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive((a) => Math.min(n - 1, (a ?? -1) + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((a) => Math.max(0, (a ?? n) - 1)); }
    else if (e.key === 'Escape') setActive(null);
  };

  const barW = Math.max(2, Math.min(28, (iw / n) * 0.62 / series.length));
  const tipLeft = active != null ? Math.min(Math.max(px(active), 90), w - 90) : 0;

  return (
    <div ref={wrap} className={cx('chart', className)}>
      <svg
        width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label} tabIndex={0}
        onPointerMove={move} onPointerLeave={() => setActive(null)} onKeyDown={onKey} onBlur={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? n - 1)}
      >
        <defs>
          <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={seriesColor(0)} stopOpacity="0.2" />
            <stop offset="1" stopColor={seriesColor(0)} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={py(t)} y2={py(t)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={m.l - 8} y={py(t) + 4} textAnchor="end" className="chart__tick">{format(t)}</text>
          </g>
        ))}
        {x.map((l, i) => (i % every === 0 ? <text key={i} x={px(i)} y={height - 8} textAnchor="middle" className="chart__tick">{l}</text> : null))}
        {kind === 'line' &&
          series.map((s, si) => {
            const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
            return (
              <g key={s.id}>
                {si === 0 && series.length === 1 && <path d={`${d} L${px(n - 1)} ${m.t + ih} L${px(0)} ${m.t + ih} Z`} fill={`url(#${gid}-a)`} />}
                <path d={d} fill="none" stroke={seriesColor(si)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
        {kind === 'bar' &&
          series.map((s, si) =>
            s.values.map((v, i) => {
              const bx = px(i) - (barW * series.length) / 2 + si * barW;
              const bh = Math.max(0, (v / max) * ih);
              return <rect key={`${s.id}${i}`} x={bx} y={m.t + ih - bh} width={Math.max(1, barW - 2)} height={bh} rx={Math.min(4, barW / 2)} fill={seriesColor(si)} opacity={active == null || active === i ? 1 : 0.45} />;
            }),
          )}
        {active != null && (
          <g pointerEvents="none">
            {kind === 'line' && <line x1={px(active)} x2={px(active)} y1={m.t} y2={m.t + ih} stroke="var(--color-border-strong)" strokeWidth="1" />}
            {kind === 'line' && series.map((s, si) => <circle key={s.id} cx={px(active)} cy={py(s.values[active] ?? 0)} r="4.5" fill={seriesColor(si)} stroke="var(--color-surface)" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {active != null && (
        <div className="chart__tip" style={{ left: tipLeft, top: 8 }} role="status">
          <strong>{xLong?.[active] ?? x[active]}</strong>
          {series.map((s, si) => (
            <span key={s.id}><i style={{ background: seriesColor(si) }} />{s.label}<b>{format(s.values[active] ?? 0)}</b></span>
          ))}
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th scope="col" />{series.map((s) => <th key={s.id} scope="col">{s.label}</th>)}</tr></thead>
        <tbody>{x.map((l, i) => <tr key={i}><th scope="row">{xLong?.[i] ?? l}</th>{series.map((s) => <td key={s.id}>{s.values[i]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color?: string }[] }) {
  return (
    <ul className="legend" role="list">
      {items.map((it, i) => (
        <li key={it.label}><i style={{ background: it.color ?? seriesColor(i) }} aria-hidden="true" />{it.label}</li>
      ))}
    </ul>
  );
}

/** Barres horizontales en HTML : libellé + valeur toujours visibles, colorées par entité (ordre fixe). */
export function HBarList({ items, format = (n) => formatNumber(n), showShare = false }: { items: { label: string; value: number; sub?: string }[]; format?: (n: number) => string; showShare?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  return (
    <ul className="hbars" role="list">
      {items.map((it, i) => (
        <li key={it.label}>
          <div className="hbars__row">
            <span className="hbars__label truncate" title={it.label}>{it.label}</span>
            <span className="hbars__value">{format(it.value)}{showShare && <small> · {Math.round((it.value / total) * 100)}%</small>}</span>
          </div>
          <div className="hbars__track" aria-hidden="true"><span style={{ transform: `scaleX(${it.value / max})`, background: seriesColor(i) }} /></div>
          {it.sub && <small className="hbars__sub">{it.sub}</small>}
        </li>
      ))}
    </ul>
  );
}

/** Anneau + légende chiffrée (≤ 6 parts ; au-delà, regrouper en « Autres » en amont). */
export function DonutChart({ items, label, centerLabel }: { items: { label: string; value: number }[]; label: string; centerLabel?: string }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="16" />
        {total > 0 &&
          items.map((it, i) => {
            const len = (it.value / total) * C;
            const gap = items.length > 1 ? 2 : 0;
            const el = (
              <circle key={it.label} cx="70" cy="70" r={R} fill="none" stroke={seriesColor(i)} strokeWidth="16" strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
            );
            offset += len;
            return el;
          })}
        <text x="70" y="68" textAnchor="middle" className="donut__total">{formatNumber(total)}</text>
        {centerLabel && <text x="70" y="86" textAnchor="middle" className="chart__tick">{centerLabel}</text>}
      </svg>
      <ul className="donut__legend" role="list">
        {items.map((it, i) => (
          <li key={it.label}>
            <i style={{ background: seriesColor(i) }} aria-hidden="true" />
            <span>{it.label}</span>
            <b>{formatNumber(it.value)}</b>
            <small>{total ? Math.round((it.value / total) * 100) : 0}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({ values, label, color = seriesColor(0) }: { values: number[]; label: string; color?: string }) {
  const w = 96;
  const h = 32;
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, values.length - 1)) * (w - 4) + 2).toFixed(1)} ${(h - 3 - ((v - min) / (max - min || 1)) * (h - 6)).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
