import { Icon } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import { initials } from '@/utilities/misc';
import type { BlockRenderProps } from '../types';

export function ProfileRender({ block, ctx }: BlockRenderProps<'profile'>) {
  const t = useT('pub');
  const d = block.data;
  const hasCover = Boolean(d.coverUrl);
  // Le titre de niveau 1 appartient à la vraie page publique ; dans un aperçu intégré (landing, éditeur) on évite plusieurs h1.
  const Heading = ctx.preview ? 'h3' : 'h1';
  return (
    <header className="pg-profile">
      {hasCover && <img className="pg-profile__cover" src={d.coverUrl} alt="" width={640} height={200} loading="lazy" decoding="async" />}
      <div className="pg-avatar" aria-hidden={d.avatarUrl ? undefined : true}>
        {d.avatarUrl ? (
          <img src={d.avatarUrl} alt={d.displayName} width={96} height={96} decoding="async" />
        ) : (
          <span>{initials(d.displayName)}</span>
        )}
      </div>
      <div className="pg-profile__text">
        <Heading className="pg-name">
          {d.displayName}
          {d.verified && (
            <span className="pg-verified" title={t('pub.verified')}>
              <Icon name="check" size={12} strokeWidth={3.2} label={t('pub.verified')} />
            </span>
          )}
        </Heading>
        {d.headline && <p className="pg-headline">{d.headline}</p>}
        {d.location && (
          <p className="pg-location">
            <Icon name="pin" size={14} /> {d.location}
          </p>
        )}
        {d.bio && <p className="pg-bio">{d.bio}</p>}
      </div>
    </header>
  );
}
