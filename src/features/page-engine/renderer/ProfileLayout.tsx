/**
 * Mise en page « profil » de la page publique, dans l'esprit des profils de réseaux sociaux :
 * photo de couverture, avatar qui la chevauche, actions rapides, puis sections ordonnées par thème.
 * Elle ne fait que présenter les mêmes blocs que l'éditeur : aucune donnée n'est ajoutée ni inventée.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { intlLocale, useT } from '@/i18n/core';
import type { AnyBlock, BlockType } from '@/models/blocks';
import type { CategoryId } from '@/models/category';
import { initials } from '@/utilities/misc';
import { qrPngBlob, systemShare } from '@/utilities/share';
import { PublicShareDialog } from '@/features/sharing/PublicShareDialog';
import { PgImage } from '../blocks/render/image';
import { SocialRender } from '../blocks/render/links';
import { safeHref, telHref, whatsappHref, mailHref } from '../blocks/urls';
import type { RenderContext } from '../blocks/types';

export type SectionId = 'about' | 'links' | 'offers' | 'showcase' | 'contact';

const SECTION_OF: Partial<Record<BlockType, SectionId>> = {
  text: 'about',
  link: 'links', cta: 'links', social: 'links',
  service: 'offers', shop: 'offers', booking: 'offers', payment: 'offers',
  portfolio: 'showcase', gallery: 'showcase', video: 'showcase',
  contact: 'contact', email: 'contact', phone: 'contact', whatsapp: 'contact', vcard: 'contact', location: 'contact', qr: 'contact',
};

export const SECTION_ICON: Record<SectionId, IconName> = { about: 'info', links: 'link', offers: 'briefcase', showcase: 'image', contact: 'pin' };

export interface Section { id: SectionId; blocks: AnyBlock[] }

/** Regroupe les blocs par thème ; les sections suivent l'ordre d'apparition de leur premier bloc dans la page. */
export function groupSections(blocks: readonly AnyBlock[]): Section[] {
  const sections: Section[] = [];
  for (const b of blocks) {
    const id = SECTION_OF[b.type];
    if (!id) continue;
    const found = sections.find((s) => s.id === id);
    if (found) found.blocks.push(b);
    else sections.push({ id, blocks: [b] });
  }
  return sections;
}

interface HeroProps {
  /** Pseudonyme de la page (nom du fichier du QR code téléchargé). */
  page: { username: string };
  profile: Extract<AnyBlock, { type: 'profile' }>;
  /** Blocs complets utilisés pour les actions rapides et les icônes de réseaux. */
  blocks: readonly AnyBlock[];
  ctx: RenderContext;
  category?: CategoryId;
  publishedAt?: string | null;
  pageUrl: string;
  highlighted: boolean;
}

type Action = { key: string; icon: IconName; label: string; href?: string; blockId?: string; external?: boolean };

export function ProfileHero({ page, profile, blocks, ctx, category, publishedAt, pageUrl, highlighted }: HeroProps) {
  const t = useT('pub', 'common');
  const d = profile.data;
  const Heading = ctx.preview ? 'h3' : 'h1';
  const [shareOpen, setShareOpen] = useState(false);

  const first = <K extends BlockType>(type: K) => blocks.find((b): b is Extract<AnyBlock, { type: K }> => b.type === type);
  const wa = first('whatsapp');
  const ph = first('phone');
  const em = first('email');
  const actions: Action[] = [];
  if (wa) actions.push({ key: 'wa', icon: 'whatsapp', label: t('pub.actions.whatsapp'), href: whatsappHref(wa.data.phone, wa.data.message), blockId: wa.id, external: true });
  if (ph) actions.push({ key: 'ph', icon: 'phone', label: t('pub.actions.call'), href: telHref(ph.data.phone), blockId: ph.id });
  if (em) actions.push({ key: 'em', icon: 'mail', label: t('pub.actions.email'), href: mailHref(em.data.email, em.data.subject), blockId: em.id });

  // « Partager » ouvre directement la feuille de partage du système (toutes les applications) avec le lien ET l'image du QR code ;
  // quand le système n'en propose pas (ordinateur), la boîte de dialogue de partage s'ouvre à la place.
  const share = async () => {
    if (ctx.preview) return;
    const outcome = await systemShare({ title: d.displayName, text: t('pub.share.message', { name: d.displayName }), url: pageUrl, qr: await qrPngBlob(pageUrl) });
    if (outcome === 'unavailable') setShareOpen(true);
  };

  const socials = blocks.filter((b): b is Extract<AnyBlock, { type: 'social' }> => b.type === 'social' && b.data.display === 'icons' && b.data.items.some((i) => safeHref(i.url)));
  const since = publishedAt ? new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' }).format(new Date(publishedAt)) : null;

  return (
    <header className={`pgp-hero pg-block pg-block--profile ${highlighted ? 'is-highlighted' : ''}`} data-block-id={profile.id}>
      <div className="pgp-cover">
        {d.coverUrl ? <PgImage className="pgp-cover__img" src={d.coverUrl} alt="" width={1000} height={320} ctx={ctx} /> : <div className="pgp-cover__art" aria-hidden="true" />}
      </div>
      <div className="pgp-id">
        <div className="pg-avatar pgp-avatar" aria-hidden={d.avatarUrl ? undefined : true}>
          {d.avatarUrl ? <img src={d.avatarUrl} alt={d.displayName} width={120} height={120} decoding="async" /> : <span>{initials(d.displayName)}</span>}
        </div>
        <div className="pgp-id__text">
          <Heading className="pg-name">
            {d.displayName}
            {d.verified && (
              <span className="pg-verified" title={t('pub.verified')}>
                <Icon name="check" size={12} strokeWidth={3.2} label={t('pub.verified')} />
              </span>
            )}
          </Heading>
          {d.headline && <p className="pg-headline">{d.headline}</p>}
          <ul className="pgp-meta" role="list">
            {category && <li><Icon name="sparkles" size={13} /> {t(`common.categories.${category}.label`)}</li>}
            {d.location && <li><Icon name="pin" size={13} /> {d.location}</li>}
            {since && <li><Icon name="calendar" size={13} /> {t('pub.since', { date: since })}</li>}
          </ul>
        </div>
        <div className="pgp-actions">
          {actions.map((a, i) => (
            <a
              key={a.key}
              className={`pgp-act ${i === 0 ? 'is-primary' : ''}`}
              href={ctx.preview ? undefined : a.href}
              role={ctx.preview ? 'link' : undefined}
              tabIndex={ctx.preview ? -1 : undefined}
              aria-disabled={ctx.preview || undefined}
              {...(a.external && !ctx.preview ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
              onClick={(e) => (ctx.preview ? e.preventDefault() : a.blockId && ctx.onTrack?.(a.blockId))}
            >
              <Icon name={a.icon} size={17} /> <span>{a.label}</span>
            </a>
          ))}
          <button type="button" className={`pgp-act ${actions.length === 0 ? 'is-primary' : ''}`} onClick={() => void share()} tabIndex={ctx.preview ? -1 : undefined}>
            <Icon name="share" size={17} /> <span>{t('pub.actions.share')}</span>
          </button>
          <button type="button" className="pgp-act" onClick={() => !ctx.preview && setShareOpen(true)} tabIndex={ctx.preview ? -1 : undefined} aria-label={t('pub.share.qrButton')}>
            <Icon name="qr" size={17} /> <span>{t('pub.share.qr')}</span>
          </button>
          {!ctx.preview && shareOpen && <PublicShareDialog open={shareOpen} onClose={() => setShareOpen(false)} url={pageUrl} name={d.displayName} username={page.username} />}
        </div>
      </div>
      {d.bio && <p className="pgp-bio">{d.bio}</p>}
      {socials.length > 0 && (
        <div className="pgp-socials">
          {socials.map((s) => <SocialRender key={s.id} block={s} ctx={ctx} />)}
        </div>
      )}
    </header>
  );
}

/** Navigation entre sections : défilement doux, section courante mise en évidence. */
export function SectionNav({ sections, preview }: { sections: readonly Section[]; preview: boolean }) {
  const t = useT('pub');
  const [active, setActive] = useState<SectionId | null>(null);
  const key = sections.map((s) => s.id).join(',');
  useEffect(() => {
    if (preview || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id.replace('pgp-sec-', '') as SectionId);
      },
      { rootMargin: '-96px 0px -55% 0px' },
    );
    for (const s of key.split(',')) {
      const el = document.getElementById(`pgp-sec-${s}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [key, preview]);
  if (sections.length < 2) return null;
  const go = (id: SectionId) => {
    if (preview) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`pgp-sec-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <nav className="pgp-nav" aria-label={t('pub.sections.nav')}>
      <ul role="list">
        {sections.map((s) => (
          <li key={s.id}>
            <button type="button" className={active === s.id ? 'is-active' : ''} aria-current={active === s.id ? 'true' : undefined} tabIndex={preview ? -1 : undefined} onClick={() => go(s.id)}>
              <Icon name={SECTION_ICON[s.id]} size={15} /> {t(`pub.sections.${s.id}`)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SectionCard({ section, children }: { section: Section; children: ReactNode }) {
  const t = useT('pub');
  return (
    <section id={`pgp-sec-${section.id}`} className={`pgp-section pg-card pgp-section--${section.id}`} aria-labelledby={`pgp-h-${section.id}`}>
      <h2 className="pgp-section__title" id={`pgp-h-${section.id}`}>
        <span className="pgp-section__icon"><Icon name={SECTION_ICON[section.id]} size={16} /></span>
        {t(`pub.sections.${section.id}`)}
      </h2>
      <div className="pgp-section__body">{children}</div>
    </section>
  );
}
