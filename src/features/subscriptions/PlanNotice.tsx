import { Link } from 'react-router-dom';
import { Alert, Icon, LinkButton } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useAccess } from '@/hooks/useAccess';
import { useT } from '@/i18n/core';
import type { PlanId } from '@/models/access';

/** Bandeau d'essai : jours restants de l'essai gratuit ou de l'essai d'abonnement ; ou essai terminé (compte verrouillé). */
export function TrialBanner() {
  const t = useT('billing', 'common');
  const { access, plan } = useAccess();
  if (access.phase === 'free_trial' || access.phase === 'paid_trial') {
    const days = access.daysLeft ?? 0;
    return (
      <Alert
        tone={days <= 2 ? 'warning' : 'info'}
        action={access.phase === 'free_trial' ? <Link to={paths.dashboard.subscription}>{t('billing.sub.bannerCta')}</Link> : undefined}
      >
        {access.phase === 'free_trial' ? t('billing.sub.bannerFree', { days }) : t('billing.sub.bannerPaid', { days, plan: t(`common.plans.${plan}`) })}
      </Alert>
    );
  }
  if (access.locked) {
    return (
      <Alert tone="danger" title={t('billing.sub.lockedTitle')} action={<LinkButton to={paths.dashboard.subscription} size="sm" variant="gradient" iconRight="arrow-right">{t('billing.sub.lockedCta')}</LinkButton>}>
        {t('billing.sub.lockedText')}
      </Alert>
    );
  }
  return null;
}

/** Fonctionnalité réservée à une offre supérieure : message clair + lien vers les offres (jamais un blocage silencieux). */
export function PlanGateNotice({ plan }: { plan: PlanId }) {
  const t = useT('billing', 'common');
  return (
    <div className="plan-gate" role="note">
      <Icon name="lock" size={18} />
      <span>{t('billing.gate.locked', { plan: t(`common.plans.${plan}`) })}</span>
      <Link to={paths.dashboard.subscription}>{t('billing.gate.upgrade')}</Link>
    </div>
  );
}
