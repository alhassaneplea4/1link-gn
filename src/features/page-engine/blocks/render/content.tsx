import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import type { BlockRenderProps } from '../types';
import { embedUrl, parseVideo, safeHref } from '../urls';
import { PgLink } from './links';

export function TextRender({ block }: BlockRenderProps<'text'>) {
  const { title, body } = block.data;
  return (
    <section className="pg-card pg-text">
      {title && <h2 className="pg-h2">{title}</h2>}
      {body.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </section>
  );
}

export function ServiceRender({ block, ctx }: BlockRenderProps<'service'>) {
  const t = useT('pub');
  const { title, items } = block.data;
  return (
    <section className="pg-section">
      {title && <h2 className="pg-h2">{title}</h2>}
      <ul className="pg-list" role="list">
        {items.map((s, i) => {
          const href = safeHref(s.url);
          return (
            <li key={i} className="pg-card pg-service">
              <div className="pg-service__head">
                <h3>{s.name}</h3>
                {s.price && <span className="pg-chip">{s.price}</span>}
              </div>
              {s.description && <p>{s.description}</p>}
              {href && (
                <PgLink href={href} blockId={block.id} ctx={ctx} icon="arrow-right" title={t('pub.learnMore')} className="pg-btn--inline" />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PortfolioRender({ block, ctx }: BlockRenderProps<'portfolio'>) {
  const { title, items } = block.data;
  return (
    <section className="pg-section">
      {title && <h2 className="pg-h2">{title}</h2>}
      <ul className="pg-grid" role="list">
        {items.map((it, i) => {
          const href = safeHref(it.url);
          const inner = (
            <>
              {it.imageUrl ? (
                <img src={it.imageUrl} alt="" width={640} height={480} loading="lazy" decoding="async" />
              ) : (
                <div className="pg-thumb-empty"><Icon name="image" size={28} /></div>
              )}
              <div className="pg-work__body">
                <h3>{it.title}</h3>
                {it.description && <p>{it.description}</p>}
              </div>
            </>
          );
          return (
            <li key={i} className="pg-card pg-work">
              {href ? (
                <a
                  href={ctx.preview ? undefined : href}
                  {...(!ctx.preview ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : { role: 'link', tabIndex: -1 })}
                  onClick={(e) => (ctx.preview ? e.preventDefault() : ctx.onTrack?.(block.id))}
                >
                  {inner}
                </a>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function GalleryRender({ block }: BlockRenderProps<'gallery'>) {
  const { title, images } = block.data;
  return (
    <section className="pg-section">
      {title && <h2 className="pg-h2">{title}</h2>}
      <ul className="pg-gallery" role="list">
        {images.map((img, i) => (
          <li key={i}>
            <img src={img.url} alt={img.alt} width={320} height={320} loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Vidéo « clic pour charger » : aucune iframe tierce (poids, vie privée) avant l'action de l'utilisateur. */
export function VideoRender({ block, ctx }: BlockRenderProps<'video'>) {
  const t = useT('pub');
  const [playing, setPlaying] = useState(false);
  const { title, url } = block.data;
  const video = parseVideo(url);
  if (!video) return <PgLink href={safeHref(url)} blockId={block.id} ctx={ctx} icon="video" title={title || url} />;
  return (
    <section className="pg-section">
      {title && <h2 className="pg-h2">{title}</h2>}
      <div className="pg-video">
        {playing && !ctx.preview ? (
          <iframe src={embedUrl(video)} title={title || t('pub.video')} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <button type="button" className="pg-video__play" onClick={() => !ctx.preview && setPlaying(true)} aria-label={t('pub.playVideo')}>
            <span><Icon name="play" size={26} /></span>
          </button>
        )}
      </div>
    </section>
  );
}

export function DividerRender({ block }: BlockRenderProps<'divider'>) {
  const { style, label } = block.data;
  if (style === 'space') return <div className="pg-space" aria-hidden="true" />;
  return (
    <div className={`pg-divider pg-divider--${style}`} role="separator" aria-label={label || undefined}>
      {label && <span>{label}</span>}
    </div>
  );
}
