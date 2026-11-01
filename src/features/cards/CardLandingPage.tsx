import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { EmptyState, LinkButton, Skeleton } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useResource } from '@/hooks/useResource';
import { useT } from '@/i18n/core';
import { api } from '@/services/api';
import './cards.css';

/**
 * `/c/<code>` : l'adresse écrite dans le QR code et la puce NFC d'une carte. En production, le serveur redirige directement vers le
 * profil ; cette page n'apparaît que si la carte est désactivée (perdue, volée), inconnue ou si le profil n'est plus en ligne.
 * Elle ne montre aucune donnée personnelle et ne demande ni compte ni application.
 */
export default function CardLandingPage() {
  const t = useT('cards');
  const { code = '' } = useParams();
  useDocumentTitle('1Link');
  const res = useResource(() => api.cards.getPublicCard(code), [code]);
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (res.status === 'loading') return <div className="cardlanding"><Skeleton width={260} height={120} radius={16} /></div>;
  const state = res.data?.state ?? 'not_found';
  if (res.data?.state === 'active') return <Navigate to={`${paths.profile(res.data.username)}?src=card`} replace />;
  return (
    <main className="cardlanding">
      <div className="cardlanding__box">
        <EmptyState icon={state === 'disabled' ? 'ban' : 'unlink'} title={t(`cards.landing.${state === 'disabled' ? 'disabled' : state === 'unavailable' ? 'unavailable' : 'notFound'}.title`)}
          description={t(`cards.landing.${state === 'disabled' ? 'disabled' : state === 'unavailable' ? 'unavailable' : 'notFound'}.text`)} />
        <LinkButton to={paths.home} variant="secondary">{t('cards.landing.home')}</LinkButton>
      </div>
    </main>
  );
}
