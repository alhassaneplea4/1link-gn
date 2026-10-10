import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import type { RenderContext } from '../types';

interface PgImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  ctx: Pick<RenderContext, 'lite' | 'preview'>;
}

/**
 * Image de page. En mode économe, rien n'est téléchargé tant que le visiteur ne le demande pas
 * (les URL de données locales, déjà en mémoire, s'affichent directement).
 */
export function PgImage({ src, alt, width, height, className, ctx }: PgImageProps) {
  const t = useT('pub');
  const [shown, setShown] = useState(false);
  const gated = ctx.lite && !ctx.preview && !shown && !src.startsWith('data:');
  if (gated) {
    return (
      <button type="button" className={`pg-imgate ${className ?? ''}`} style={{ aspectRatio: `${width} / ${height}` }} onClick={() => setShown(true)} aria-label={`${t('pub.lite.showImage')}${alt ? ` : ${alt}` : ''}`}>
        <Icon name="image" size={22} />
        <span>{t('pub.lite.showImage')}</span>
      </button>
    );
  }
  return <img className={className} src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />;
}
