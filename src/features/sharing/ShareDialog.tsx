import { useState } from 'react';
import { Alert, Button, Modal, useToast } from '@/components/ui';
import { QrCode } from '@/features/page-engine/blocks/render/places';
import { pageShareUrl, publicUrl, env } from '@/app/configuration/env';
import { useT } from '@/i18n/core';
import { copyToClipboard } from '@/utilities/misc';
import './share.css';

/** Partage de la page : copie du lien, QR code, WhatsApp, partage natif quand disponible. */
export function ShareDialog({ open, onClose, username, published }: { open: boolean; onClose: () => void; username: string; published: boolean }) {
  const t = useT('editor');
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const url = pageShareUrl(username);
  const copy = async () => {
    const ok = await copyToClipboard(url);
    setCopied(ok);
    toast.push({ tone: ok ? 'success' : 'error', title: ok ? t('editor.share.copied') : t('editor.share.copyFailed') });
    if (ok) setTimeout(() => setCopied(false), 2200);
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
            <Button iconLeft={copied ? 'check' : 'copy'} onClick={() => void copy()}>{copied ? t('editor.share.copiedShort') : t('editor.share.copy')}</Button>
            <a className="btn btn--secondary btn--md" href={`https://wa.me/?text=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
              <span className="btn__label">{t('editor.share.whatsapp')}</span>
            </a>
            {canShare && <Button variant="secondary" iconLeft="share" onClick={() => void navigator.share({ url, title: '1Link' }).catch(() => undefined)}>{t('editor.share.native')}</Button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
