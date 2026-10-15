import { Link } from 'react-router-dom';
import { BadgeMark, Badge, Card, Icon } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import { BADGE_IDS } from '@/models/badges';
import { useSession } from '@/state/session';

/** Les badges du compte : ceux qui sont obtenus, et comment obtenir les autres (offre, vérification, équipe). */
export function BadgesCard() {
  const t = useT('common', 'dashboard');
  const badges = useSession((s) => s.session?.user.badges ?? []);
  return (
    <Card padding="lg" className="settings__card" data-testid="badges-card">
      <h2><Icon name="award" size={18} /> {t('dashboard.badges.title')}</h2>
      <p className="muted">{t('dashboard.badges.text')}</p>
      <ul role="list" className="badgelist">
        {BADGE_IDS.map((id) => {
          const earned = badges.includes(id);
          return (
            <li key={id} className={`badgelist__item ${earned ? 'is-earned' : ''}`}>
              <BadgeMark badge={id} size={28} />
              <div>
                <strong>{t(`common.badges.${id}.label`)} <Badge tone={earned ? 'success' : 'neutral'} dot>{earned ? t('dashboard.badges.earned') : t('dashboard.badges.locked')}</Badge></strong>
                <p className="muted">{t(`common.badges.${id}.how`)}{!earned && (id === 'pro' || id === 'business') && <> <Link to={paths.dashboard.subscription}>{t('dashboard.badges.seePlans')}</Link></>}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
