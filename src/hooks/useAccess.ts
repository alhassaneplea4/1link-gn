import { RIGHTS, type AccessInfo, type PlanId, type PlanRights } from '@/models/access';
import { useSession } from '@/state/session';

const NO_ACCESS: AccessInfo = { phase: 'expired', plan: 'free', trialEndsAt: null, daysLeft: 0, locked: false, paidTrialAvailable: true };

/** Offre effective et droits du compte, tels que le serveur les a calculés (l'interface ne fait que les refléter). */
export function useAccess(): { access: AccessInfo; plan: PlanId; rights: PlanRights; locked: boolean } {
  const access = useSession((s) => s.session?.access) ?? NO_ACCESS;
  return { access, plan: access.plan, rights: RIGHTS[access.plan], locked: access.locked };
}

/** Lecture ponctuelle (hors rendu) des droits de la session courante. */
export const currentRights = (): PlanRights => RIGHTS[useSession.getState().session?.access?.plan ?? 'free'];
