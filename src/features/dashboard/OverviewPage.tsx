import { isContactVerified } from '@/models/auth';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Icon, LinkButton, PageHeader, ProgressBar, Skeleton, StatCard, useToast } from '@/components/ui';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { CATEGORY_CONFIG, type FocusItem } from '@/features/categories/config';
import { pageReadiness, setupChecklist, setupState } from '@/features/page-engine/document';
import { blockRegistry, blockSummary } from '@/features/page-engine/blocks/registry';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { rangeFromPreset } from '@/features/analytics/ranges';
import { ShareDialog } from '@/features/sharing/ShareDialog';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { pageShareUrl, publicUrl } from '@/app/configuration/env';
import { paths } from '@/app/configuration/paths';
import { getPlan } from '@/app/configuration/plans';
import { useT } from '@/i18n/core';
import type { MessageKey } from '@/i18n/types';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import { formatCompact, formatDate, formatPercent, formatRelative } from '@/utilities/format';
import './dashboard.css';

const STATE_TONE = { not_started: 'neutral', in_progress: 'info', to_complete: 'warning', ready: 'brand', published: 'success' } as const;
const STATE_LABEL = { not_started: 'notStarted', in_progress: 'inProgress', to_complete: 'toComplete', ready: 'ready', published: 'published' } as const;

export default function OverviewPage() {
  const t = useT('dashboard', 'common', 'analytics', 'editor');
  useDocumentTitle(`${t('dashboard.nav.overview')} · 1Link`);
  const navigate = useNavigate();
  const toast = useToast();
  const session = useSession((s) => s.session);
  const doc = useEditor((s) => s.doc);
  const status = useEditor((s) => s.status);
  const [shareOpen, setShareOpen] = useState(false);
  const range = useMemo(() => rangeFromPreset('7d'), []);
  const report = useResource(() => api.analytics.getReport(range), [range.from, range.to]);
  const sub = useResource(() => api.billing.getSubscription(), []);

  const user = session?.user;
  const cfg = CATEGORY_CONFIG[doc?.category ?? user?.category ?? 'individual'];
  const state = setupState(doc);
  const checklist = useMemo(() => (doc ? setupChecklist(doc) : []), [doc]);
  const progress = checklist.length ? (checklist.filter((c) => c.done).length / checklist.length) * 100 : 0;
  const readiness = doc ? pageReadiness(doc) : null;
  const unpublished = doc?.status === 'published' && doc.publishedAt && doc.updatedAt > doc.publishedAt;
  const recent = useMemo(() => [...(doc?.blocks ?? [])].filter((b) => b.updatedAt).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, 4), [doc]);

  const run = (item: FocusItem) => {
    const a = item.action;
    if (a.type === 'goto') navigate(a.to);
    else if (a.type === 'share') setShareOpen(true);
    else if (a.type === 'add-block') {
      const res = useEditor.getState().addBlock(a.block);
      if (res.ok) navigate(paths.dashboard.page);
      else {
        toast.push({ tone: 'warning', title: res.reason === 'singleton' ? t('editor.picker.singletonExists') : t('editor.picker.planLimit') });
        if (res.reason === 'singleton') navigate(paths.dashboard.page);
      }
    }
  };

  const recommendations = useMemo(() => {
    if (!doc) return [];
    const has = (...types: string[]) => doc.blocks.some((b) => b.visible && types.includes(b.type));
    const profile = doc.blocks.find((b) => b.type === 'profile');
    const bio = profile?.type === 'profile' ? profile.data.bio.trim() : '';
    const checks: Record<string, { done: boolean; action: () => void }> = {
      addBio: { done: Boolean(bio), action: () => { useEditor.getState().select(profile?.id ?? null); navigate(paths.dashboard.page); } },
      addLinks: { done: doc.blocks.filter((b) => b.type === 'link').length >= 2, action: () => run({ id: 'links', icon: 'link', action: { type: 'add-block', block: 'link' } }) },
      addServices: { done: has('service'), action: () => run({ id: 'services', icon: 'briefcase', action: { type: 'add-block', block: 'service' } }) },
      addPortfolio: { done: has('portfolio'), action: () => run({ id: 'portfolio', icon: 'layers', action: { type: 'add-block', block: 'portfolio' } }) },
      addLocation: { done: has('location'), action: () => run({ id: 'location', icon: 'pin', action: { type: 'add-block', block: 'location' } }) },
      shareQr: { done: has('qr'), action: () => run({ id: 'share', icon: 'qr', action: { type: 'add-block', block: 'qr' } }) },
      tryTheme: { done: doc.appearance.themeId !== 'minimal', action: () => navigate(paths.dashboard.appearance) },
      addContact: { done: has('contact', 'email', 'phone', 'whatsapp'), action: () => run({ id: 'contacts', icon: 'phone', action: { type: 'add-block', block: 'contact' } }) },
      addVideo: { done: has('video'), action: () => run({ id: 'contents', icon: 'video', action: { type: 'add-block', block: 'video' } }) },
      addVcard: { done: has('vcard'), action: () => run({ id: 'vcard', icon: 'user-check', action: { type: 'add-block', block: 'vcard' } }) },
      addBooking: { done: has('booking'), action: () => run({ id: 'appointments', icon: 'calendar', action: { type: 'add-block', block: 'booking' } }) },
      addShop: { done: has('shop'), action: () => run({ id: 'catalog', icon: 'store', action: { type: 'add-block', block: 'shop' } }) },
      addPayment: { done: has('payment'), action: () => run({ id: 'payments', icon: 'wallet', action: { type: 'add-block', block: 'payment' } }) },
      addEvents: { done: has('text'), action: () => run({ id: 'events', icon: 'calendar', action: { type: 'add-block', block: 'text' } }) },
    };
    return cfg.recommendations.filter((k) => !checks[k]!.done).map((k) => ({ key: k, run: checks[k]!.action }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, cfg]);

  if (status === 'loading' || status === 'idle') return <div aria-busy="true"><Skeleton height={40} width="40%" /><div style={{ height: 24 }} /><div className="ov-grid"><Skeleton height={180} radius={16} /><Skeleton height={180} radius={16} /></div></div>;
  if (status === 'error' || !doc || !user) return <ErrorState onRetry={() => void useEditor.getState().load({ force: true })} />;

  const r = report.data;
  const plan = getPlan(sub.data?.planId ?? user.plan);

  return (
    <div className="ov">
      <PageHeader
        title={t('dashboard.overview.greeting', { name: user.name.split(' ')[0] ?? user.name })}
        description={t(`dashboard.overview.intro.${cfg.id}`)}
        actions={
          <>
            <Button variant="secondary" iconLeft="share" onClick={() => setShareOpen(true)}>{t('dashboard.overview.share')}</Button>
            <LinkButton to={paths.dashboard.page} variant="gradient" iconLeft="pencil">{t('dashboard.overview.editPage')}</LinkButton>
          </>
        }
      />

      {session && !isContactVerified(session.user) && (
        <Alert tone="info" title={t('dashboard.overview.verifyTitle')} className="ov__alert" action={<LinkButton to={paths.verifyEmail} size="sm" variant="secondary">{t('dashboard.shell.verifyCta')}</LinkButton>}>
          {t('dashboard.overview.verifyText')}
        </Alert>
      )}

      <div className="ov-grid">
        {/* Statut de publication */}
        <Card className="ov-status" padding="lg">
          <div className="ov-status__top">
            <Badge tone={STATE_TONE[state]} dot>{t(`common.status.${STATE_LABEL[state]}` as MessageKey)}</Badge>
            {unpublished && <Badge tone="warning">{t('editor.toolbar.unpublishedChanges')}</Badge>}
          </div>
          <h2>{t(`dashboard.overview.state.${state}.title`)}</h2>
          <p className="muted">{t(`dashboard.overview.state.${state}.text`)}</p>
          {doc.username && (
            <p className="ov-status__url"><Icon name="link" size={16} />
              {doc.status === 'published' ? <a href={`/${doc.username}`} target="_blank" rel="noopener noreferrer">{publicUrl(doc.username)}</a> : <span className="mono">{publicUrl(doc.username)}</span>}
            </p>
          )}
          {readiness && readiness.incomplete.length > 0 && <p className="ov-status__warn"><Icon name="alert" size={16} /> {t('dashboard.overview.incomplete', { count: readiness.incomplete.length })}</p>}
          <div className="ov-status__actions">
            <LinkButton to={paths.dashboard.page} variant={state === 'ready' || unpublished ? 'gradient' : 'secondary'} iconLeft={state === 'published' && !unpublished ? 'pencil' : 'rocket'}>
              {state === 'published' ? (unpublished ? t('dashboard.overview.publishChanges') : t('dashboard.overview.editPage')) : state === 'ready' ? t('dashboard.overview.publishNow') : t('dashboard.overview.continueSetup')}
            </LinkButton>
          </div>
        </Card>

        {/* Progression */}
        <Card className="ov-progress" padding="lg">
          <div className="ov-progress__head">
            <h2>{t('dashboard.overview.setupTitle')}</h2>
            <span className="ov-progress__count">{checklist.filter((c) => c.done).length}/{checklist.length}</span>
          </div>
          <ProgressBar value={progress} label={t('dashboard.overview.setupTitle')} />
          <ul role="list" className="checklist">
            {checklist.map((c) => (
              <li key={c.id} className={c.done ? 'is-done' : ''}>
                <span className="checklist__mark" aria-hidden="true">{c.done && <Icon name="check" size={12} strokeWidth={3.4} />}</span>
                <span>{t(`dashboard.overview.checklist.${c.id}`)}</span>
                <span className="sr-only">{c.done ? t('common.yes') : t('common.no')}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Statistiques */}
      <section aria-labelledby="ov-stats" className="ov-section">
        <div className="ov-section__head">
          <h2 id="ov-stats">{t('dashboard.overview.statsTitle')}</h2>
          <span className="subtle">{t('dashboard.overview.last7')}</span>
          <Link to={paths.dashboard.analytics} className="ov-section__link">{t('dashboard.overview.seeAnalytics')} <Icon name="arrow-right" size={14} /></Link>
        </div>
        {report.status === 'error' ? (
          <Card><ErrorState code={report.error} onRetry={report.reload} compact /></Card>
        ) : (
          <div className="stats">
            <StatCard label={t('analytics.metrics.views')} icon="eye" loading={report.status === 'loading'} value={r ? formatCompact(r.totals.views) : '—'} delta={r?.deltas.views} spark={r?.series.map((p) => p.views)} />
            <StatCard label={t('analytics.metrics.visitors')} icon="users" loading={report.status === 'loading'} value={r ? formatCompact(r.totals.visitors) : '—'} delta={r?.deltas.visitors} />
            <StatCard label={t('analytics.metrics.clicks')} icon="click" loading={report.status === 'loading'} value={r ? formatCompact(r.totals.clicks) : '—'} delta={r?.deltas.clicks} spark={r?.series.map((p) => p.clicks)} />
            <StatCard label={t('analytics.metrics.ctr')} icon="target" loading={report.status === 'loading'} value={r ? formatPercent(r.totals.ctr, 1) : '—'} delta={r?.deltas.ctr} />
          </div>
        )}
      </section>

      <div className="ov-cols">
        <div className="ov-main">
          {/* Raccourcis de la catégorie */}
          <section aria-labelledby="ov-focus" className="ov-section">
            <div className="ov-section__head"><h2 id="ov-focus">{t(`dashboard.overview.focusTitle.${cfg.id}`)}</h2></div>
            <ul role="list" className="focus">
              {cfg.focus.map((f) => (
                <li key={`${f.id}-${f.action.type}`}>
                  <button type="button" className="focus__card" onClick={() => run(f)} disabled={f.action.type === 'soon'}>
                    <span className="focus__icon"><Icon name={f.icon} size={20} /></span>
                    <span className="focus__text">
                      <strong>{t(`dashboard.focus.${f.id}.title`)}{f.action.type === 'soon' && <Badge tone="neutral" className="focus__soon">{t('dashboard.overview.soon')}</Badge>}</strong>
                      <small>{t(`dashboard.focus.${f.id}.text`)}</small>
                    </span>
                    <Icon name="arrow-right" size={16} className="focus__arrow" />
                  </button>
                </li>
              ))}
            </ul>
            {cfg.id === 'creator' && <p className="subtle ov-note"><Icon name="info" size={14} /> {t('dashboard.overview.creatorNote')}</p>}
          </section>

          {/* Recommandations */}
          <section aria-labelledby="ov-reco" className="ov-section">
            <div className="ov-section__head"><h2 id="ov-reco">{t('dashboard.overview.recoTitle')}</h2></div>
            {recommendations.length === 0 ? (
              <Card><EmptyState compact icon="check-circle" title={t('dashboard.overview.recoDone')} /></Card>
            ) : (
              <ul role="list" className="recos">
                {recommendations.map((rc) => (
                  <li key={rc.key} className="reco">
                    <span className="reco__icon"><Icon name="sparkles" size={18} /></span>
                    <span className="reco__text"><strong>{t(`dashboard.recommendations.${rc.key}.title`)}</strong><small>{t(`dashboard.recommendations.${rc.key}.text`)}</small></span>
                    <Button size="sm" variant="secondary" onClick={rc.run}>{t('dashboard.overview.doIt')}</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Modifications récentes */}
          <section aria-labelledby="ov-recent" className="ov-section">
            <div className="ov-section__head"><h2 id="ov-recent">{t('dashboard.overview.recentTitle')}</h2></div>
            <Card padding="none">
              {recent.length === 0 ? <EmptyState compact icon="history" title={t('dashboard.overview.recentEmpty')} /> : (
                <ul role="list" className="recent">
                  {recent.map((b) => (
                    <li key={b.id}>
                      <span className="recent__icon"><Icon name={blockRegistry[b.type].icon} size={16} /></span>
                      <span className="recent__text"><strong>{t(`editor.blocks.${b.type}.label`)}</strong><small className="truncate">{blockSummary(b) || '—'}</small></span>
                      <time className="subtle" dateTime={b.updatedAt}>{b.updatedAt ? formatRelative(b.updatedAt) : ''}</time>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>

        <aside className="ov-side" aria-label={t('dashboard.overview.previewTitle')}>
          <Card padding="md" className="ov-preview">
            <h2>{t('dashboard.overview.previewTitle')}</h2>
            <PhoneFrame label={t('dashboard.overview.previewTitle')} className="ov-preview__phone"><PageRenderer page={doc} pageUrl={pageShareUrl(doc.username || 'exemple')} preview /></PhoneFrame>
            <p className="subtle ov-preview__meta">{doc.publishedAt ? `${t('dashboard.overview.publishedOn')} ${formatDate(doc.publishedAt)}` : t('dashboard.overview.notPublishedYet')}</p>
          </Card>
          <Card padding="md" className="ov-sub">
            <h2>{t('dashboard.overview.subTitle')}</h2>
            {sub.status === 'loading' ? <Skeleton height={20} width="60%" /> : sub.status === 'error' ? <ErrorState compact code={sub.error} onRetry={sub.reload} /> : (
              <>
                <p className="ov-sub__plan"><strong>{t(`common.plans.${plan.id}`)}</strong> <Badge tone={sub.data?.status === 'active' ? 'success' : 'warning'} dot>{t(`dashboard.overview.subStatus.${sub.data?.status ?? 'active'}`)}</Badge></p>
                {sub.data?.renewsAt && <p className="subtle">{sub.data.cancelAtPeriodEnd ? t('dashboard.overview.endsOn') : t('dashboard.overview.renewsOn')} {formatDate(sub.data.renewsAt)}</p>}
                <LinkButton to={paths.dashboard.subscription} variant="secondary" size="sm" iconRight="arrow-right">{plan.id === 'business' ? t('dashboard.overview.manage') : t('dashboard.shell.upgrade')}</LinkButton>
              </>
            )}
          </Card>
        </aside>
      </div>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} username={doc.username || 'exemple'} published={doc.status === 'published'} />
    </div>
  );
}

