import { useEffect, useId, useMemo, useState } from 'react';
import { Segmented } from '@/components/ui';
import { useT } from '@/i18n/core';
import type { CardDesign } from '@/models/cards';
import { qrMatrix } from './print';
import { cardSvg, type CardSide } from './render';
import './cards.css';

/** Matrice du QR code d'une adresse (calculée à la demande, hors du rendu). */
export function useQrMatrix(url: string): boolean[][] | null {
  const [matrix, setMatrix] = useState<boolean[][] | null>(null);
  useEffect(() => {
    let live = true;
    if (!url) { setMatrix(null); return; }
    void qrMatrix(url).then((m) => live && setMatrix(m), () => live && setMatrix(null));
    return () => { live = false; };
  }, [url]);
  return matrix;
}

/** Une face de carte, rendue en SVG (aperçu : coins arrondis et reflet, jamais le fichier d'impression). */
export function CardFace({ design, side, url, nfc, qr, label }: { design: CardDesign; side: CardSide; url: string; nfc: boolean; qr: boolean[][] | null; label: string }) {
  const id = `cf${useId().replace(/[^a-zA-Z0-9]/g, '')}${side}`;
  const svg = useMemo(() => cardSvg(design, side, { mode: 'preview', qr, url, nfc, idPrefix: id }), [design, side, qr, url, nfc, id]);
  // Le SVG est produit par notre propre générateur : tout texte saisi y est échappé et seules des images 1Link y sont admises.
  return <div className="cardface" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * Carte « physique » : ombre portée, léger relief et retournement recto / verso (désactivé si l'utilisateur limite les animations).
 * L'adresse du QR code est celle du profil tant que la carte n'est pas commandée ; chaque carte reçoit ensuite son code définitif.
 */
export function CardPreview({ design, url, nfc, side, onSide, compact }: { design: CardDesign; url: string; nfc: boolean; side?: CardSide; onSide?: (s: CardSide) => void; compact?: boolean }) {
  const t = useT('cards');
  const [own, setOwn] = useState<CardSide>('front');
  const current = side ?? own;
  const qr = useQrMatrix(url);
  const set = (s: CardSide) => (onSide ? onSide(s) : setOwn(s));
  return (
    <figure className={`cardprev ${compact ? 'cardprev--compact' : ''}`}>
      <div className={`cardprev__stage ${current === 'back' ? 'is-back' : ''}`}>
        <div className="cardprev__flip">
          <div className="cardprev__side cardprev__side--front" aria-hidden={current !== 'front'}><CardFace design={design} side="front" url={url} nfc={nfc} qr={qr} label={t('cards.preview.front')} /></div>
          <div className="cardprev__side cardprev__side--back" aria-hidden={current !== 'back'}><CardFace design={design} side="back" url={url} nfc={nfc} qr={qr} label={t('cards.preview.back')} /></div>
        </div>
      </div>
      {!compact && (
        <figcaption className="cardprev__caption">
          <Segmented size="sm" label={t('cards.preview.side')} value={current} onChange={set} options={[{ value: 'front', label: t('cards.preview.front') }, { value: 'back', label: t('cards.preview.back') }]} />
        </figcaption>
      )}
    </figure>
  );
}
