import { isContactVerified } from '@/models/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, LinkButton, SearchBar } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { getPlan } from '@/app/configuration/plans';
import { pageReadiness } from '@/features/page-engine/document';
import { blockRegistry, blockSummary } from '@/features/page-engine/blocks/registry';
import { useOutsideClick } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useEditor, useEditorBlocks } from '@/state/editor';
import { useSession } from '@/state/session';
import { AppShell, ThemeToggle, type NavEntry } from './AppShell';
import { AccountMenu, DemoBanner, Notifications, VerifyBanner } from './header-parts';

/** Recherche globale : sections du dashboard et blocs de la page (les données viennent du store, pas d'un index fictif). */
function GlobalSearch({ nav }: { nav: NavEntry[] }) {
  const t = useT('dashboard');
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const blocks = useEditorBlocks();
  useOutsideClick(box, q !== '', () => setQ(''));
  const results = useMemo(() => {
    const term = q.toLowerCase();
    if (!term) return [];
    const sections = nav.filter((n) => n.label.toLowerCase().includes(term)).map((n) => ({ key: n.id, label: n.label, hint: t('dashboard.shell.section'), icon: n.icon, run: () => navigate(n.to) }));
    const bl = blocks.filter((b) => `${blockSummary(b)} ${b.type}`.toLowerCase().includes(term)).slice(0, 5).map((b) => ({
      key: b.id, label: blockSummary(b) || b.type, hint: t('dashboard.shell.block'), icon: blockRegistry[b.type].icon,
      run: () => { useEditor.getState().select(b.id); navigate(paths.dashboard.page); },
    }));
    return [...sections, ...bl];
  }, [q, nav, blocks, navigate, t]);
  return (
    <div className="topbar__search" ref={box} onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); if (e.key === 'Enter' && results[0]) { results[0].run(); setQ(''); } }}>
      <SearchBar label={t('dashboard.shell.search')} placeholder={t('dashboard.shell.searchPlaceholder')} onSearch={setQ} delay={120} />
      {q && (
        <div className="search-results" role="listbox" aria-label={t('dashboard.shell.search')}>
          {results.length === 0 ? <p className="subtle" style={{ padding: '0.6rem', fontSize: 'var(--text-sm)' }}>{t('dashboard.shell.noResults')}</p> : results.map((r) => (
            <button key={r.key} type="button" role="option" aria-selected={false} onClick={() => { r.run(); setQ(''); }}>
              <Icon name={r.icon} size={16} /> {r.label} <small>{r.hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout() {
  const t = useT('dashboard', 'common');
  const session = useSession((s) => s.session);
  const doc = useEditor((s) => s.doc);
  useEffect(() => void useEditor.getState().load(), []);

  const nav: NavEntry[] = useMemo(() => [
    { id: 'overview', to: paths.dashboard.root, end: true, icon: 'dashboard', label: t('dashboard.nav.overview'), primaryMobile: true },
    { id: 'page', to: paths.dashboard.page, icon: 'pencil', label: t('dashboard.nav.page'), primaryMobile: true },
    { id: 'content', to: paths.dashboard.content, icon: 'layers', label: t('dashboard.nav.content') },
    { id: 'appearance', to: paths.dashboard.appearance, icon: 'palette', label: t('dashboard.nav.appearance'), primaryMobile: true },
    { id: 'analytics', to: paths.dashboard.analytics, icon: 'chart', label: t('dashboard.nav.analytics'), primaryMobile: true },
    { id: 'subscription', to: paths.dashboard.subscription, icon: 'credit-card', label: t('dashboard.nav.subscription') },
    { id: 'settings', to: paths.dashboard.settings, icon: 'settings', label: t('dashboard.nav.settings') },
    { id: 'security', to: paths.dashboard.security, icon: 'shield', label: t('dashboard.nav.security') },
  ], [t]);

  // Notifications calculées depuis l'état réel (aucune notification fictive).
  const notifications = useMemo(() => {
    const out: { id: string; icon: 'alert' | 'mail' | 'rocket' | 'info'; title: string; text: string; to?: string }[] = [];
    if (session && !isContactVerified(session.user)) out.push({ id: 'verify', icon: 'mail', title: t('dashboard.notifications.verify'), text: t('dashboard.notifications.verifyText'), to: paths.verifyEmail });
    if (doc) {
      const r = pageReadiness(doc);
      if (doc.status !== 'published') out.push({ id: 'unpublished', icon: 'rocket', title: t('dashboard.notifications.draft'), text: t('dashboard.notifications.draftText'), to: paths.dashboard.page });
      else if (doc.publishedAt && doc.updatedAt > doc.publishedAt) out.push({ id: 'changes', icon: 'info', title: t('dashboard.notifications.changes'), text: t('dashboard.notifications.changesText'), to: paths.dashboard.page });
      if (r.incomplete.length) out.push({ id: 'incomplete', icon: 'alert', title: t('dashboard.notifications.incomplete', { count: r.incomplete.length }), text: t('dashboard.notifications.incompleteText'), to: paths.dashboard.page });
    }
    return out;
  }, [session, doc, t]);

  const plan = session ? getPlan(session.user.plan) : null;
  return (
    <AppShell
      variant="user"
      nav={nav}
      banners={<><DemoBanner /><VerifyBanner /></>}
      header={
        <>
          <GlobalSearch nav={nav} />
          <span className="topbar__grow" />
          <div className="topbar__actions">
            {doc?.username && doc.status === 'published' && (
              <a className="btn btn--ghost btn--sm" href={`/${doc.username}`} target="_blank" rel="noopener noreferrer"><Icon name="external" size={16} /><span className="btn__label">{t('dashboard.shell.viewPage')}</span></a>
            )}
            <ThemeToggle />
            <Notifications items={notifications} />
            <AccountMenu extraItems={[
              { id: 'settings', label: t('dashboard.nav.settings'), icon: 'settings', to: paths.dashboard.settings },
              { id: 'sub', label: t('dashboard.nav.subscription'), icon: 'credit-card', to: paths.dashboard.subscription },
              ...(session && session.permissions.length > 0 ? [{ id: 'admin', label: t('dashboard.shell.adminCenter'), icon: 'shield-check' as const, to: paths.admin.root, separatorBefore: true }] : []),
            ]} />
          </div>
        </>
      }
      sidebarFooter={plan && (
        <div className="sidebar-plan">
          <span className="eyebrow">{t('dashboard.shell.currentPlan')}</span>
          <strong>{t(`common.plans.${plan.id}`)}</strong>
          {plan.id !== 'business' && <LinkButton to={paths.dashboard.subscription} size="sm" variant="gradient" iconRight="arrow-right">{t('dashboard.shell.upgrade')}</LinkButton>}
        </div>
      )}
      moreContent={<p style={{ marginTop: 'var(--space-4)' }}><Link to={paths.dashboard.subscription}>{t('dashboard.shell.upgrade')}</Link></p>}
    />
  );
}
