import { useEffect, useState } from 'react';
import { Alert, Button, ErrorState, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { LogoSymbol } from '@/components/ui/Logo';
import { QrCode } from '@/features/page-engine/blocks/render/places';
import { pageShareUrl, publicUrl } from '@/app/configuration/env';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import { trackedUrl } from '@/utilities/tracking';
import { contrastRatio } from '@/utilities/color';
import './print.css';

type Format = 'poster' | 'cards';

/** Couleur d'accent imprimable : la première couleur de la page lisible sur fond blanc (sinon bleu 1Link). */
export const printAccent = (colors: { primary: string; accent: string }): string =>
  [colors.primary, colors.accent].find((c) => contrastRatio(c, '#ffffff') >= 3) ?? '#2563eb';

/**
 * Supports imprimables : affiche A4 et planche de 10 cartes de visite (85 × 55 mm) avec QR code.
 * Le QR de chaque support porte son propre `?src=` pour mesurer les scans par support.
 * L'impression utilise le navigateur (« Enregistrer au format PDF » inclus) : aucune génération côté serveur.
 */
export default function PrintPage() {
  const t = useT('dashboard', 'editor', 'common');
  useDocumentTitle(`${t('dashboard.print.title')} · 1Link`);
  const status = useEditor((s) => s.status);
  const doc = useEditor((s) => s.doc);
  const branding = useSession((s) => !s.session?.entitlements.removeBranding);
  const [format, setFormat] = useState<Format>('poster');
  useEffect(() => void useEditor.getState().load(), []);

  if (status === 'error') return <ErrorState onRetry={() => void useEditor.getState().load({ force: true })} />;
  if (!doc) return <Skeleton height={360} radius={16} />;

  const profile = doc.blocks.find((b) => b.type === 'profile');
  const name = profile?.type === 'profile' ? profile.data.displayName : doc.username;
  const headline = profile?.type === 'profile' ? profile.data.headline : '';
  const base = pageShareUrl(doc.username || 'exemple');
  const accent = printAccent(doc.appearance.colors);
  const published = doc.status === 'published';
  const label = t('dashboard.print.qrLabel');

  return (
    <div className="printpage">
      <PageHeader
        title={t('dashboard.print.title')} description={t('dashboard.print.description')}
        actions={<Button variant="gradient" iconLeft="download" onClick={() => window.print()}>{t('dashboard.print.print')}</Button>}
      />
      <div className="print-controls">
        <Segmented label={t('dashboard.print.format')} value={format} onChange={setFormat} options={[{ value: 'poster', label: t('dashboard.print.poster'), icon: 'file' }, { value: 'cards', label: t('dashboard.print.cards'), icon: 'credit-card' }]} />
      </div>
      {!published && <Alert tone="warning" className="print-controls" title={t('dashboard.print.notPublishedTitle')}>{t('dashboard.print.notPublished')}</Alert>}
      <Alert tone="info" className="print-controls">{t('dashboard.print.tip')}</Alert>

      <div className="print-stage">
        <div className={`print-sheet print-sheet--${format}`} style={{ ['--accent' as string]: accent }}>
          {format === 'poster' ? (
            <article className="poster" aria-label={t('dashboard.print.poster')}>
              <header className="poster__brand"><LogoSymbol size={48} /><span>1Link</span></header>
              <div className="poster__body">
                <h2 className="poster__name">{name}</h2>
                {headline && <p className="poster__headline">{headline}</p>}
                <div className="poster__qr"><QrCode value={trackedUrl(base, 'poster')} size={400} label={label} /></div>
                <p className="poster__scan">{t('dashboard.print.scan')}</p>
                <p className="poster__url">{publicUrl(doc.username || 'exemple')}</p>
              </div>
              <footer className="poster__foot">{branding ? t('dashboard.print.madeWith') : t('common.slogan')}</footer>
            </article>
          ) : (
            <div className="cards" aria-label={t('dashboard.print.cards')}>
              {Array.from({ length: 10 }, (_, i) => (
                <article key={i} className="bizcard" aria-hidden={i > 0 ? true : undefined}>
                  <div className="bizcard__text">
                    <strong>{name}</strong>
                    {headline && <span>{headline}</span>}
                    <small>{publicUrl(doc.username || 'exemple')}</small>
                  </div>
                  <div className="bizcard__qr"><QrCode value={trackedUrl(base, 'card')} size={200} label={i === 0 ? label : ''} /></div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
