/**
 * Guards de navigation — UNIQUEMENT pour l'expérience (redirections propres).
 * La protection réelle des données et des actions est assurée par le backend : masquer une page
 * ici ne protège rien.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import type { AdminSection } from '@/models/auth';
import { useSession } from '@/state/session';
import { ForbiddenPage } from './errors';

export function FullPageLoader() {
  const t = useT('common');
  return (
    <div className="fullpage-loader" role="status">
      <Spinner size={28} label={t('common.loading')} />
    </div>
  );
}

export function RequireAuth() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <FullPageLoader />;
  const next = encodeURIComponent(location.pathname + location.search);
  if (status === 'expired') return <Navigate to={`${paths.sessionExpired}?next=${next}`} replace />;
  if (status === 'anonymous') return <Navigate to={`${paths.login}?next=${next}`} replace />;
  return <Outlet />;
}

/** Les utilisateurs qui n'ont pas terminé l'onboarding sont ramenés à l'assistant. */
export function RequireOnboarded() {
  const done = useSession((s) => s.session?.user.onboardingDone);
  return done ? <Outlet /> : <Navigate to={paths.onboarding} replace />;
}

export function RequireAdminAccess() {
  const count = useSession((s) => s.session?.permissions.length ?? 0);
  return count > 0 ? <Outlet /> : <Navigate to={paths.forbidden} replace />;
}

/** Affiche l'accès restreint dans la mise en page admin si la permission de lecture manque. */
export function RequireSection({ section }: { section: AdminSection }) {
  const allowed = useSession((s) => s.session?.permissions.includes(`${section}:read`) ?? false);
  return allowed ? <Outlet /> : <ForbiddenPage embedded />;
}

/** Pages d'authentification : un utilisateur connecté est redirigé vers son espace. */
export function RedirectIfAuthenticated() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.session?.user);
  const location = useLocation();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'authenticated' && user) {
    const next = new URLSearchParams(location.search).get('next');
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
    if (safe) return <Navigate to={safe} replace />;
    if (!user.onboardingDone) return <Navigate to={paths.onboarding} replace />;
    return <Navigate to={user.adminRole ? paths.admin.root : paths.dashboard.root} replace />;
  }
  return <Outlet />;
}
