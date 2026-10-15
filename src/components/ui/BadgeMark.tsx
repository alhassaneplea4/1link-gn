import type { BadgeId } from '@/models/badges';
import { useT } from '@/i18n/core';
import { Icon, type IconName } from './Icon';
import './badge-mark.css';

export const BADGE_ICON: Record<BadgeId, IconName> = { official: 'shield-check', team: 'award', verified: 'check', business: 'crown', pro: 'star' };

/** Pastille d'un badge de profil (couleurs fixes : un badge ne prend jamais les couleurs du thème de la page). */
export function BadgeMark({ badge, size = 20 }: { badge: BadgeId; size?: number }) {
  const t = useT('common');
  const label = t(`common.badges.${badge}.label`);
  return (
    <span className={`bmark bmark--${badge}`} title={label} style={{ width: size, height: size }}>
      <Icon name={BADGE_ICON[badge]} size={Math.round(size * 0.62)} strokeWidth={badge === 'verified' ? 3.2 : 2.4} label={label} />
    </span>
  );
}

/** Liste de badges (les plus élevés d'abord). */
export function BadgeMarks({ badges, size }: { badges: readonly BadgeId[]; size?: number }) {
  return <>{badges.map((b) => <BadgeMark key={b} badge={b} size={size} />)}</>;
}
