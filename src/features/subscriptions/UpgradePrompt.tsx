import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { Button, Icon, Modal } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useAccess } from '@/hooks/useAccess';
import { useT } from '@/i18n/core';
import { PAID_PLAN_IDS, PLAN_IDS, type PlanId } from '@/models/access';

interface UpgradeRequest {
  /** Offre qui ouvre la fonctionnalité. */
  plan: PlanId;
  /** Nom (déjà traduit) de la fonctionnalité touchée : bloc, thème, onglet… */
  feature?: string;
}

interface UpgradeState {
  request: UpgradeRequest | null;
  open(request: UpgradeRequest): void;
  close(): void;
}

const useUpgrade = create<UpgradeState>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

/** Ouvre le modal « Voulez-vous vous abonner ? » depuis n'importe quelle fonctionnalité verrouillée. */
export const openUpgradePrompt = (request: UpgradeRequest) => useUpgrade.getState().open(request);

/** Offre payante immédiatement supérieure à l'offre courante (pour une limite atteinte, sans offre « minimale » évidente). */
export const nextPaidPlan = (current: PlanId): PlanId => PLAN_IDS[Math.min(PLAN_IDS.indexOf(current) + 1, PLAN_IDS.length - 1)]!;

/**
 * Modal d'abonnement : une fonctionnalité réservée à une offre n'est jamais un blocage silencieux. Le clic l'ouvre ;
 * « Oui » mène à la page des offres, « Non, plus tard » ferme sans rien changer. Monté une seule fois dans l'espace connecté.
 */
export function UpgradePromptHost() {
  const t = useT('billing', 'common');
  const navigate = useNavigate();
  const { access } = useAccess();
  const request = useUpgrade((s) => s.request);
  const close = useUpgrade((s) => s.close);
  if (!request) return null;
  const plan = t(`common.plans.${request.plan}`);
  const trial = access.paidTrialAvailable && PAID_PLAN_IDS.includes(request.plan);
  return (
    <Modal
      open onClose={close} size="sm" title={t('billing.upgrade.title')}
      footer={(
        <>
          <Button variant="secondary" onClick={close}>{t('billing.upgrade.later')}</Button>
          <Button variant="gradient" iconRight="arrow-right" onClick={() => { close(); void navigate(paths.dashboard.subscription); }}>{t('billing.upgrade.yes')}</Button>
        </>
      )}
    >
      <div className="upgrade-prompt">
        <span className="upgrade-prompt__icon" aria-hidden="true"><Icon name="lock" size={22} /></span>
        <p>{request.feature ? t('billing.upgrade.textFeature', { feature: request.feature, plan }) : t('billing.upgrade.text', { plan })}</p>
        <p className="subtle">{trial ? t('billing.upgrade.trial') : t('billing.upgrade.question')}</p>
      </div>
    </Modal>
  );
}
