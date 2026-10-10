import { useEffect, useState } from 'react';
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

/** QR Code réel (encodage local, chargé à la demande). */
export function QrCode({ value, size = 168, label }: { value: string; size?: number; label?: string }) {
  const [path, setPath] = useState<{ d: string; n: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import('qrcode-generator').then((mod) => {
      if (cancelled) return;
      const qrcode = (mod as { default: typeof import('qrcode-generator') }).default;
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      setPath({ d, n });
    });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return (
    <svg
      className="pg-qr__svg"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      viewBox={path ? `-2 -2 ${path.n + 4} ${path.n + 4}` : '0 0 1 1'}
      role="img"
      aria-label={label ?? value}
      shapeRendering="crispEdges"
    >
      <rect x="-2" y="-2" width="100%" height="100%" fill="#fff" />
      {path && <path d={path.d} fill="#111827" />}
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
