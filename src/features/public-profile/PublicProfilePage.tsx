import { useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Icon, LinkButton, Logo, Skeleton } from '@/components/ui';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { NotFoundPage } from '@/app/routes/errors';
import { paths } from '@/app/configuration/paths';
import { pageShareUrl } from '@/app/configuration/env';
import { useT } from '@/i18n/core';
import type { PublicPageResult } from '@/models/page';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { RESERVED_USERNAMES } from '@/utilities/validation';
import { useLiteMode } from './useLiteMode';
import './public.css';

/** Met à jour les métadonnées de partage (titre, description, Open Graph) côté client. */
function usePageMeta(title: string | null, description: string | null, indexable: boolean) {
  useEffect(() => {
    if (!title) return;
    const prevTitle = document.title;
    document.title = title;
    const created: HTMLMetaElement[] = [];
    const set = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      const existed = Boolean(el);
      const prev = el?.content;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
        created.push(el);
      }
      el.content = content;
      return () => { if (existed && el) el.content = prev ?? ''; };
    };
    const restores = [
      set('property', 'og:title', title),
      ...(description ? [set('name', 'description', description), set('property', 'og:description', description)] : []),
      set('name', 'robots', indexable ? 'index,follow' : 'noindex,nofollow'),
    ];
    return () => {
      document.title = prevTitle;
      restores.forEach((r) => r());
      created.forEach((m) => m.remove());
    };
  }, [title, description, indexable]);
}

function StatePage({ kind, onRetry }: { kind: 'draft' | 'suspended' | 'unavailable' | 'not_found'; onRetry?: () => void }) {
  const t = useT('pub');
  const key = kind === 'not_found' ? 'notFound' : kind;
  usePageMeta(t(`pub.states.${key}.title`), null, false);
  const icon = kind === 'suspended' ? 'ban' : kind === 'unavailable' ? 'wifi-off' : kind === 'draft' ? 'clock' : 'compass';
  return (
    <main className="pubstate" id="main">
      <Logo />
      <div className="pubstate__card">
        <span className="pubstate__icon"><Icon name={icon} size={28} /></span>
        <h1>{t(`pub.states.${key}.title`)}</h1>
        <p>{t(`pub.states.${key}.text`)}</p>
        <div className="pubstate__actions">
          {kind === 'unavailable' && onRetry && <Button iconLeft="refresh" onClick={onRetry}>{t('pub.states.unavailable.retry')}</Button>}
          <LinkButton to={kind === 'not_found' ? paths.register : paths.home} variant={kind === 'not_found' ? 'gradient' : 'secondary'}>
            {kind === 'not_found' ? t('pub.states.notFound.cta') : t('pub.states.home')}
          </LinkButton>
        </div>
      </div>
    </main>
  );
}

export default function PublicProfilePage() {
  const { username = '' } = useParams();
  const t = useT('pub');
  const [lite, toggleLite] = useLiteMode();
  const reserved = RESERVED_USERNAMES.has(username.toLowerCase());
  const res = useResource<PublicPageResult>(() => (reserved ? Promise.resolve({ state: 'not_found' as const }) : api.page.getPublicPage(username)), [username]);
  const page = res.data?.state === 'published' ? res.data.page : null;
  const profile = page?.blocks.find((b) => b.type === 'profile');
  const name = profile?.type === 'profile' ? profile.data.displayName : username;
  usePageMeta(page ? `${page.share.title || name} · 1Link` : null, page ? page.share.description || (profile?.type === 'profile' ? profile.data.headline : '') : null, Boolean(page));

  // Une vue est comptabilisée une seule fois par chargement de page publiée.
  useEffect(() => {
    if (page) void api.page.trackEvent(page.username, { type: 'view' }).catch(() => undefined);
  }, [page?.username]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTrack = useCallback((blockId: string) => void api.page.trackEvent(username, { type: 'click', blockId }).catch(() => undefined), [username]);

  if (reserved) return <NotFoundPage />;
  if (res.status === 'loading') {
    return (
      <main className="pubload" aria-busy="true" aria-label={t('pub.states.loading')}>
        <Skeleton width={92} height={92} radius="50%" /><Skeleton width={180} height={22} /><Skeleton width={240} height={14} />
        <Skeleton width="min(90%, 420px)" height={54} radius={14} /><Skeleton width="min(90%, 420px)" height={54} radius={14} /><Skeleton width="min(90%, 420px)" height={54} radius={14} />
      </main>
    );
  }
  if (res.status === 'error') return <StatePage kind="unavailable" onRetry={res.reload} />;
  const data = res.data!;
  if (data.state !== 'published') return <StatePage kind={data.state} />;
  return (
    <main id="main">
      <PageRenderer
        page={data.page} pageUrl={pageShareUrl(data.page.username)} fullscreen branding={data.branding} onTrack={onTrack} lite={lite}
        footer={<button type="button" aria-pressed={lite} onClick={toggleLite} title={t('pub.lite.hint')}>{lite ? t('pub.lite.on') : t('pub.lite.off')}</button>}
      />
    </main>
  );
}
