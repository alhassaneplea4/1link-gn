import { BadgeMarks } from '@/components/ui/BadgeMark';
import type { BadgeId } from '@/models/badges';
import { Icon } from '@/components/ui/Icon';
import { initials } from '@/utilities/misc';
import type { BlockRenderProps } from '../types';
import { PgImage } from './image';

/** Badges du profil (serveur) ; à défaut, la coche « vérifié » historique. */
export function ProfileBadges({ data }: { data: { verified: boolean; badges?: BadgeId[] } }) {
  const badges: BadgeId[] = data.badges ?? (data.verified ? ['verified'] : []);
  if (!badges.length) return null;
  return <span className="pg-badges"><BadgeMarks badges={badges} size={20} /></span>;
}

export function ProfileRender({ block, ctx }: BlockRenderProps<'profile'>) {
  const d = block.data;
  const hasCover = Boolean(d.coverUrl);
  // Le titre de niveau 1 appartient à la vraie page publique ; dans un aperçu intégré (landing, éditeur) on évite plusieurs h1.
  const Heading = ctx.preview ? 'h3' : 'h1';
  return (
    <header className="pg-profile">
      {hasCover && <PgImage className="pg-profile__cover" src={d.coverUrl} alt="" width={640} height={200} ctx={ctx} />}
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
          <ProfileBadges data={d} />
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
