import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import type { BlockRenderProps } from '../types';
import { PgImage } from './image';

/** Une galerie contient au plus cinq images (le serveur applique la même limite). */
export const GALLERY_MAX = 5;

/**
 * Galerie en carrousel (cinq images au plus) : on fait défiler, un clic ouvre l'image en taille réelle avec sa brève description,
 * et une croix (ou Échap, ou un clic à côté) la referme. Aucune dépendance externe ; clavier et lecteurs d'écran pris en charge.
 */
export function GalleryRender({ block, ctx }: BlockRenderProps<'gallery'>) {
  const t = useT('pub');
  const { title, images } = block.data;
  const shown = images.filter((i) => i.url).slice(0, GALLERY_MAX);
  const track = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(shown.length - 1, i));
    const slide = el.children[next] as HTMLElement | undefined;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (slide && typeof el.scrollTo === 'function') el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
    setCurrent(next);
  }, [shown.length]);

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.children.length) return;
    const first = el.children[0] as HTMLElement;
    const step = (el.children.length > 1 ? (el.children[1] as HTMLElement).offsetLeft - first.offsetLeft : el.clientWidth) || 1;
    setCurrent(Math.max(0, Math.min(shown.length - 1, Math.round(el.scrollLeft / step))));
  };

  if (shown.length === 0) return null;
  return (
    <section className="pg-section">
      {title && <h2 className="pg-h2">{title}</h2>}
      <div className="pg-carousel" role="region" aria-roledescription="carousel" aria-label={title || t('pub.gallery.label')}>
        <ul className="pg-carousel__track" role="list" ref={track} onScroll={onScroll}>
          {shown.map((img, i) => (
            <li key={i} className="pg-carousel__slide" role="group" aria-roledescription="slide" aria-label={t('pub.gallery.slide', { n: i + 1, total: shown.length })}>
              <button
                type="button" className="pg-carousel__open" tabIndex={ctx.preview ? -1 : undefined}
                onClick={() => !ctx.preview && setOpen(i)} aria-label={t('pub.gallery.open', { n: i + 1 })}
              >
                <PgImage src={img.url} alt={img.alt} width={640} height={480} ctx={ctx} />
              </button>
              {img.alt && <p className="pg-carousel__caption">{img.alt}</p>}
            </li>
          ))}
        </ul>
        {shown.length > 1 && (
          <div className="pg-carousel__bar">
            <button type="button" className="pg-carousel__nav" onClick={() => go(current - 1)} disabled={current === 0} aria-label={t('pub.gallery.prev')} tabIndex={ctx.preview ? -1 : undefined}><Icon name="chevron-left" size={18} /></button>
            <ol className="pg-carousel__dots" role="list">
              {shown.map((_, i) => (
                <li key={i}><button type="button" className={i === current ? 'is-active' : ''} aria-label={t('pub.gallery.go', { n: i + 1 })} aria-current={i === current ? 'true' : undefined} onClick={() => go(i)} tabIndex={ctx.preview ? -1 : undefined} /></li>
              ))}
            </ol>
            <button type="button" className="pg-carousel__nav" onClick={() => go(current + 1)} disabled={current === shown.length - 1} aria-label={t('pub.gallery.next')} tabIndex={ctx.preview ? -1 : undefined}><Icon name="chevron-right" size={18} /></button>
          </div>
        )}
      </div>
      {open !== null && <Lightbox images={shown} index={open} onIndex={setOpen} onClose={() => { setOpen(null); go(open); }} />}
    </section>
  );
}

/** Visionneuse plein écran : image en taille réelle, brève description, croix de fermeture, flèches. */
function Lightbox({ images, index, onIndex, onClose }: { images: { url: string; alt: string }[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = useT('pub');
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const img = images[index]!;

  useEffect(() => {
    opener.current = document.activeElement;
    closeBtn.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIndex(Math.min(images.length - 1, index + 1));
      else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
      else if (e.key === 'Tab') {
        // Le focus reste dans la visionneuse.
        const items = Array.from(document.querySelectorAll<HTMLElement>('.pg-lightbox button:not(:disabled)'));
        if (!items.length) return;
        const first = items[0]!, last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onClose, onIndex]);

  return createPortal(
    <div className="pg-lightbox" role="dialog" aria-modal="true" aria-label={t('pub.gallery.viewer')} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button ref={closeBtn} type="button" className="pg-lightbox__close" onClick={onClose} aria-label={t('pub.gallery.close')}><Icon name="x" size={22} strokeWidth={2.6} /></button>
      <figure className="pg-lightbox__figure">
        <img src={img.url} alt={img.alt} decoding="async" />
        <figcaption className="pg-lightbox__caption">
          {img.alt && <span>{img.alt}</span>}
          <small>{index + 1} / {images.length}</small>
        </figcaption>
      </figure>
      {images.length > 1 && (
        <>
          <button type="button" className="pg-lightbox__nav pg-lightbox__nav--prev" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label={t('pub.gallery.prev')}><Icon name="chevron-left" size={26} /></button>
          <button type="button" className="pg-lightbox__nav pg-lightbox__nav--next" onClick={() => onIndex(index + 1)} disabled={index === images.length - 1} aria-label={t('pub.gallery.next')}><Icon name="chevron-right" size={26} /></button>
        </>
      )}
    </div>,
    document.body,
  );
}
