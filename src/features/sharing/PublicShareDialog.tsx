import { useState } from 'react';
import { Button, Icon, Modal, useToast } from '@/components/ui';
import { QrCode } from '@/features/page-engine/blocks/render/places';
import { useT } from '@/i18n/core';
import { copyToClipboard } from '@/utilities/misc';
import { downloadBlob, isNativeApp, qrPngBlob, systemShare } from '@/utilities/share';
import { trackedUrl } from '@/utilities/tracking';
import './share.css';

interface Props {
  open: boolean;
  onClose: () => void;
  url: string;
  /** Nom affiché dans le message de partage. */
  name: string;
  username: string;
}

/** Partage d'une page publique, côté visiteur : QR code, copie, partage système (lien + image du QR), réseaux usuels. */
export function PublicShareDialog({ open, onClose, url, name, username }: Props) {
  const t = useT('pub');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const text = t('pub.share.message', { name });
  const native = isNativeApp();

  const shareAll = async () => {
    setBusy(true);
    const outcome = await systemShare({ title: name, text, url, qr: await qrPngBlob(url) });
    setBusy(false);
    if (outcome === 'unavailable') toast.push({ tone: 'info', title: t('pub.share.unavailable') });
  };
  const copy = async () => {
    const ok = await copyToClipboard(url);
    toast.push({ tone: ok ? 'success' : 'error', title: ok ? t('pub.actions.copied') : t('pub.share.copyFailed') });
  };
  const download = async () => {
    const blob = await qrPngBlob(url);
    if (blob) downloadBlob(blob, `qr-${username}.png`);
  };
  const enc = encodeURIComponent;
  const links = [
    { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${text} ${trackedUrl(url, 'whatsapp')}`)}` },
    { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(trackedUrl(url, 'facebook'))}` },
    { id: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
    { id: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
    { id: 'email', label: t('pub.actions.email'), href: `mailto:?subject=${enc(name)}&body=${enc(`${text}\n${url}`)}` },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t('pub.share.title')} description={t('pub.share.description')} size="sm">
      <div className="pshare">
        <div className="pshare__qr"><QrCode value={url} size={200} label={t('pub.qrAlt')} /></div>
        <p className="pshare__url mono">{url.replace(/^https?:\/\//, '')}</p>
        <Button variant="gradient" size="lg" fullWidth iconLeft="share" loading={busy} onClick={() => void shareAll()}>{t('pub.share.system')}</Button>
        <p className="subtle pshare__note"><Icon name="info" size={13} /> {t('pub.share.systemHint')}</p>
        <div className="pshare__row">
          <Button variant="secondary" iconLeft="copy" onClick={() => void copy()}>{t('pub.share.copy')}</Button>
          {!native && <Button variant="secondary" iconLeft="download" onClick={() => void download()}>{t('pub.share.downloadQr')}</Button>}
        </div>
        <ul role="list" className="pshare__apps" aria-label={t('pub.share.via')}>
          {links.map((l) => (
            <li key={l.id}><a className="btn btn--secondary btn--sm" href={l.href} target="_blank" rel="noopener noreferrer"><span className="btn__label">{l.label}</span></a></li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
