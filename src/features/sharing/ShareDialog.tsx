import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Icon, Modal, useToast } from '@/components/ui';
import { QrCode } from '@/features/page-engine/blocks/render/places';
import { pageShareUrl, publicUrl, env } from '@/app/configuration/env';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import type { MessageKey } from '@/i18n/types';
import { copyToClipboard } from '@/utilities/misc';
import { TRACKING_SOURCES, trackedUrl, type TrackingSource } from '@/utilities/tracking';
import './share.css';

/** Partage de la page : copie du lien, QR code, WhatsApp, liens de suivi par canal, impression. */
export function ShareDialog({ open, onClose, username, published }: { open: boolean; onClose: () => void; username: string; published: boolean }) {
  const t = useT('editor');
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const url = pageShareUrl(username);
  const copy = async (value: string, key: string) => {
    const ok = await copyToClipboard(value);
    setCopied(ok ? key : null);
    toast.push({ tone: ok ? 'success' : 'error', title: ok ? t('editor.share.copied') : t('editor.share.copyFailed') });
    if (ok) setTimeout(() => setCopied((c) => (c === key ? null : c)), 2200);
  };
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  return (
    <Modal open={open} onClose={onClose} title={t('editor.share.title')} description={t('editor.share.description')}>
      {!published && <Alert tone="warning" title={t('editor.share.notPublishedTitle')} className="share__alert">{t('editor.share.notPublished')}</Alert>}
      {env.isDemo && published && <Alert tone="info" className="share__alert">{t('editor.share.demoNote')}</Alert>}
      <div className="share">
        <div className="share__qr"><QrCode value={url} size={176} label={t('editor.share.qrAlt')} /></div>
        <div className="share__side">
          <p className="share__url mono" aria-label={t('editor.share.link')}>{publicUrl(username)}</p>
          <div className="share__actions">
            <Button iconLeft={copied === 'main' ? 'check' : 'copy'} onClick={() => void copy(url, 'main')}>{copied === 'main' ? t('editor.share.copiedShort') : t('editor.share.copy')}</Button>
            <a className="btn btn--secondary btn--md" href={`https://wa.me/?text=${encodeURIComponent(trackedUrl(url, 'whatsapp'))}`} target="_blank" rel="noopener noreferrer">
              <span className="btn__label">{t('editor.share.whatsapp')}</span>
            </a>
            {canShare && <Button variant="secondary" iconLeft="share" onClick={() => void navigator.share({ url, title: '1Link' }).catch(() => undefined)}>{t('editor.share.native')}</Button>}
          </div>
        </div>
      </div>

      <section className="share__tracking" aria-labelledby="share-tracking">
        <h3 id="share-tracking">{t('editor.share.tracking.title')}</h3>
        <p className="muted">{t('editor.share.tracking.text')}</p>
        <ul role="list" className="share__sources">
          {TRACKING_SOURCES.map((src: TrackingSource) => (
            <li key={src}>
              <span>{t(`editor.share.tracking.sources.${src}` as MessageKey)}</span>
              <code className="mono" title={trackedUrl(url, src)}>?src={src}</code>
              <button type="button" className="share__copy" aria-label={`${t('editor.share.copy')} — ${t(`editor.share.tracking.sources.${src}` as MessageKey)}`} onClick={() => void copy(trackedUrl(url, src), src)}>
                <Icon name={copied === src ? 'check' : 'copy'} size={16} />
              </button>
            </li>
          ))}
        </ul>
        <p className="subtle share__note"><Icon name="info" size={13} /> {t('editor.share.tracking.note')}</p>
      </section>

      <p className="share__print">
        <Link className="btn btn--secondary btn--md" to={paths.dashboard.print} onClick={onClose}>
          <Icon name="download" size={18} /><span className="btn__label">{t('editor.share.print')}</span>
        </Link>
      </p>
    </Modal>
  );
}
