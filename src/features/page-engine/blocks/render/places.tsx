import { useEffect, useId, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import type { BlockRenderProps } from '../types';
import { mailHref, mapsHref, safeHref, telHref, whatsappHref } from '../urls';
import { PgLink } from './links';

const CONTACT_ICONS: Record<string, IconName> = { email: 'mail', phone: 'phone', whatsapp: 'whatsapp', address: 'pin', website: 'globe' };

export function ContactRender({ block, ctx }: BlockRenderProps<'contact'>) {
  const { title, items } = block.data;
  return (
    <section className="pg-section">
      {title && <h2 className="pg-h2">{title}</h2>}
      <div className="pg-stack">
        {items.map((it, i) => {
          const href =
            it.kind === 'email' ? mailHref(it.value)
            : it.kind === 'phone' ? telHref(it.value)
            : it.kind === 'whatsapp' ? whatsappHref(it.value)
            : it.kind === 'address' ? mapsHref(it.value)
            : safeHref(it.value);
          return (
            <PgLink key={i} href={href} blockId={block.id} ctx={ctx} icon={CONTACT_ICONS[it.kind] ?? 'link'} title={it.label || it.value} description={it.label ? it.value : undefined} external={it.kind === 'website' || it.kind === 'address' || it.kind === 'whatsapp'} />
          );
        })}
      </div>
    </section>
  );
}

export function LocationRender({ block, ctx }: BlockRenderProps<'location'>) {
  const t = useT('pub');
  const d = block.data;
  const href = safeHref(d.mapUrl) ?? mapsHref(d.address);
  return (
    <section className="pg-card pg-location-card">
      <div className="pg-location-card__head">
        <span className="pg-btn__icon"><Icon name="pin" size={20} /></span>
        <div>
          <h2 className="pg-h3">{d.label || t('pub.location')}</h2>
          <p>{d.address}</p>
          {d.hours && <p className="pg-muted"><Icon name="clock" size={14} /> {d.hours}</p>}
        </div>
      </div>
      <PgLink href={href} blockId={block.id} ctx={ctx} icon="compass" title={t('pub.directions')} className="pg-btn--inline" />
    </section>
  );
}

/** QR Code réel (encodage local, chargé à la demande) avec badge logo 1Link au centre. */
export function QrCode({ value, size = 168, label, withLogo = true }: { value: string; size?: number; label?: string; withLogo?: boolean }) {
  const [data, setData] = useState<{ d: string; n: number; logo?: { start: number; size: number } } | null>(null);
  const gradId = useId();

  useEffect(() => {
    let cancelled = false;
    void import('qrcode-generator').then((mod) => {
      if (cancelled) return;
      const qrcode = (mod as { default: typeof import('qrcode-generator') }).default;
      // 'H' (High) permet 30% de tolérance aux erreurs, garantissant une scannabilité parfaite avec le logo au centre.
      const qr = qrcode(0, 'H');
      qr.addData(value);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      const logoSize = withLogo ? Math.max(6, Math.round(n * 0.24)) : 0;
      const logoStart = (n - logoSize) / 2;

      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
        }
      }
      setData({ d, n, logo: withLogo ? { start: logoStart, size: logoSize } : undefined });
    });
    return () => {
      cancelled = true;
    };
  }, [value, withLogo]);

  return (
    <svg
      className="pg-qr__svg"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      viewBox={data ? `-2 -2 ${data.n + 4} ${data.n + 4}` : '0 0 1 1'}
      role="img"
      aria-label={label ?? value}
      shapeRendering="crispEdges"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect x="-2" y="-2" width="100%" height="100%" fill="#fff" />
      {data && <path d={data.d} fill="#111827" />}
      {data?.logo && (
        <g shapeRendering="geometricPrecision">
          <rect
            x={data.logo.start - 0.45}
            y={data.logo.start - 0.45}
            width={data.logo.size + 0.9}
            height={data.logo.size + 0.9}
            rx={1}
            fill="#ffffff"
          />
          <svg
            x={data.logo.start}
            y={data.logo.start}
            width={data.logo.size}
            height={data.logo.size}
            viewBox="0 0 48 48"
          >
            <rect width="48" height="48" rx="14" fill={`url(#${gradId})`} />
            <path
              d="M14.5 17.5 22 11.5V34h8"
              fill="none"
              stroke="#fff"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="36" cy="34" r="3.1" fill="none" stroke="#fff" strokeWidth="2.6" />
          </svg>
        </g>
      )}
    </svg>
  );
}

export function QrRender({ block, ctx }: BlockRenderProps<'qr'>) {
  const t = useT('pub');
  const d = block.data;
  const target = d.target === 'custom' && safeHref(d.url) ? d.url : ctx.pageUrl;
  return (
    <section className="pg-card pg-qr">
      <QrCode value={target} label={t('pub.qrAlt')} />
      <p>{d.label || t('pub.scanQr')}</p>
    </section>
  );
}
