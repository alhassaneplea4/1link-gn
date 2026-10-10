import type { MouseEvent, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import type { SocialPlatform } from '@/models/blocks';
import type { BlockRenderProps, RenderContext } from '../types';
import { mailHref, platformIcon, safeHref, telHref, whatsappHref } from '../urls';

export const PLATFORM_NAMES: Record<SocialPlatform, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn',
  x: 'X', whatsapp: 'WhatsApp', telegram: 'Telegram', website: 'Site web',
};

interface PgLinkProps {
  href: string | undefined;
  blockId: string;
  ctx: RenderContext;
  icon: IconName;
  title: ReactNode;
  description?: string;
  highlight?: boolean;
  external?: boolean;
  className?: string;
}

/** Bouton-lien générique de la page publique ; en aperçu, il n'ouvre rien et ne compte aucun clic. */
export function PgLink({ href, blockId, ctx, icon, title, description, highlight, external = true, className = '' }: PgLinkProps) {
  const onClick = (e: MouseEvent) => {
    if (ctx.preview) {
      e.preventDefault();
      return;
    }
    ctx.onTrack?.(blockId);
  };
  return (
    <a
      className={`pg-btn ${highlight ? 'is-highlight' : ''} ${className}`}
      href={ctx.preview ? undefined : href}
      role={ctx.preview ? 'link' : undefined}
      aria-disabled={ctx.preview || undefined}
      tabIndex={ctx.preview ? -1 : undefined}
      {...(external && !ctx.preview ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
      onClick={onClick}
    >
      <span className="pg-btn__icon"><Icon name={icon} size={20} /></span>
      <span className="pg-btn__body">
        <span className="pg-btn__title">{title}</span>
        {description && <span className="pg-btn__desc">{description}</span>}
      </span>
      <Icon name="arrow-up-right" size={16} className="pg-btn__arrow" />
    </a>
  );
}

export function LinkRender({ block, ctx }: BlockRenderProps<'link'>) {
  const d = block.data;
  return <PgLink href={safeHref(d.url)} blockId={block.id} ctx={ctx} icon={platformIcon(d.platform)} title={d.title} description={d.description} highlight={d.highlight} />;
}

export function SocialRender({ block, ctx }: BlockRenderProps<'social'>) {
  const items = block.data.items.filter((i) => safeHref(i.url));
  if (block.data.display === 'list') {
    return (
      <div className="pg-stack">
        {items.map((i, idx) => (
          <PgLink key={idx} href={safeHref(i.url)} blockId={block.id} ctx={ctx} icon={i.platform === 'website' ? 'globe' : i.platform} title={PLATFORM_NAMES[i.platform]} />
        ))}
      </div>
    );
  }
  return (
    <ul className="pg-socials" role="list">
      {items.map((i, idx) => (
        <li key={idx}>
          <a
            className="pg-social"
            href={ctx.preview ? undefined : safeHref(i.url)}
            aria-label={PLATFORM_NAMES[i.platform]}
            {...(!ctx.preview ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : { role: 'link', tabIndex: -1 })}
            onClick={(e) => (ctx.preview ? e.preventDefault() : ctx.onTrack?.(block.id))}
          >
            <Icon name={i.platform === 'website' ? 'globe' : i.platform} size={20} />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function CtaRender({ block, ctx }: BlockRenderProps<'cta'>) {
  const d = block.data;
  return (
    <div className="pg-cta">
      {d.description && <p className="pg-cta__desc">{d.description}</p>}
      <PgLink href={safeHref(d.url)} blockId={block.id} ctx={ctx} icon="rocket" title={d.label} highlight className="pg-btn--cta" />
    </div>
  );
}

export function EmailRender({ block, ctx }: BlockRenderProps<'email'>) {
  const d = block.data;
  return <PgLink href={mailHref(d.email, d.subject)} blockId={block.id} ctx={ctx} icon="mail" title={d.label || d.email} description={d.label ? d.email : undefined} external={false} />;
}

export function PhoneRender({ block, ctx }: BlockRenderProps<'phone'>) {
  const d = block.data;
  return <PgLink href={telHref(d.phone)} blockId={block.id} ctx={ctx} icon="phone" title={d.label || d.phone} description={d.label ? d.phone : undefined} external={false} />;
}

export function WhatsappRender({ block, ctx }: BlockRenderProps<'whatsapp'>) {
  const t = useT('pub');
  const d = block.data;
  return <PgLink href={whatsappHref(d.phone, d.message)} blockId={block.id} ctx={ctx} icon="whatsapp" title={d.label || t('pub.whatsapp')} description={d.phone} />;
}
