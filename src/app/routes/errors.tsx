import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Icon, LinkButton, Logo, Button } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useSession } from '@/state/session';

function Shell({ icon, title, text, children, embedded, code }: { icon: 'compass' | 'lock' | 'alert'; title: string; text: string; children: React.ReactNode; embedded?: boolean; code: string }) {
  useDocumentTitle(`${title} · 1Link`);
  return (
    <main className={embedded ? 'statuspage statuspage--embedded' : 'statuspage'} id="main">
      {!embedded && <Logo className="statuspage__logo" />}
      <div className="statuspage__card">
        <span className="statuspage__code" aria-hidden="true">{code}</span>
        <span className="statuspage__icon"><Icon name={icon} size={28} /></span>
        <h1>{title}</h1>
        <p>{text}</p>
        <div className="statuspage__actions">{children}</div>
      </div>
    </main>
  );
}

export function NotFoundPage() {
  const t = useT('common');
  return (
    <Shell code="404" icon="compass" title={t('common.notFound.title')} text={t('common.notFound.text')}>
      <LinkButton to={paths.home} variant="gradient" iconLeft="home">{t('common.notFound.home')}</LinkButton>
    </Shell>
  );
}

export function ForbiddenPage({ embedded }: { embedded?: boolean }) {
  const t = useT('common');
  const user = useSession((s) => s.session?.user);
  return (
    <Shell embedded={embedded} code="403" icon="lock" title={t('common.forbidden.title')} text={t('common.forbidden.text')}>
      <LinkButton to={user?.adminRole && embedded ? paths.admin.root : user ? paths.dashboard.root : paths.home} variant="secondary" iconLeft="arrow-left">{t('common.forbidden.home')}</LinkButton>
    </Shell>
  );
}

/** Erreur de route (chargement d'un chunk, exception de rendu) : jamais d'écran blanc. */
export function RouteErrorPage() {
  const t = useT('common');
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <Shell code="" icon="alert" title={t('common.routeError.title')} text={t('common.routeError.text')}>
      <Button variant="gradient" iconLeft="refresh" onClick={() => window.location.reload()}>{t('common.routeError.reload')}</Button>
      <LinkButton to={paths.home} variant="secondary">{t('common.notFound.home')}</LinkButton>
    </Shell>
  );
}
