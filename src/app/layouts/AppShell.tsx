import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Drawer, Icon, IconButton, Logo, type IconName } from '@/components/ui';
import { useT } from '@/i18n/core';
import { applyAppTheme } from '@/state/ui';
import { useUi } from '@/state/ui';
import './app-shell.css';

export interface NavEntry {
  id: string;
  to: string;
  icon: IconName;
  label: string;
  end?: boolean;
  group?: string;
  badge?: ReactNode;
  /** Affichée dans la barre mobile du bas (sinon dans « Plus »). */
  primaryMobile?: boolean;
}

interface AppShellProps {
  variant: 'user' | 'admin';
  brandLabel?: string;
  nav: NavEntry[];
  header: ReactNode;
  sidebarFooter?: ReactNode;
  banners?: ReactNode;
  moreContent?: ReactNode;
}

/** Applique le thème sombre/clair de l'application (réservé aux espaces connectés). */
export function useAppTheme() {
  const pref = useUi((s) => s.theme);
  useEffect(() => {
    applyAppTheme(pref, true);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyAppTheme(pref, true);
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      applyAppTheme('light', false);
    };
  }, [pref]);
}

function NavList({ nav, onNavigate }: { nav: NavEntry[]; onNavigate?: () => void }) {
  const groups = nav.reduce<Record<string, NavEntry[]>>((acc, n) => {
    (acc[n.group ?? ''] ??= []).push(n);
    return acc;
  }, {});
  return (
    <>
      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="sidenav__group">
          {group && <p className="sidenav__heading">{group}</p>}
          <ul role="list">
            {items.map((n) => (
              <li key={n.id}>
                <NavLink to={n.to} end={n.end} className={({ isActive }) => `sidenav__link ${isActive ? 'is-active' : ''}`} onClick={onNavigate}>
                  <Icon name={n.icon} size={19} />
                  <span>{n.label}</span>
                  {n.badge}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function AppShell({ variant, brandLabel, nav, header, sidebarFooter, banners, moreContent }: AppShellProps) {
  const t = useT('common', 'dashboard');
  useAppTheme();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [location.pathname]);
  const mobilePrimary = nav.filter((n) => n.primaryMobile).slice(0, 4);
  const rest = nav.filter((n) => !mobilePrimary.includes(n));

  return (
    <div className={`shell shell--${variant}`}>
      <a href="#main" className="skip-link">{t('common.skipToContent')}</a>
      <aside className="sidebar" aria-label={t('dashboard.shell.navigation')}>
        <div className="sidebar__brand">
          <NavLink to="/" aria-label="1Link"><Logo tone={variant === 'admin' ? 'light' : 'auto'} size={32} /></NavLink>
          {brandLabel && <span className="sidebar__tag">{brandLabel}</span>}
        </div>
        <nav className="sidenav" aria-label={t('dashboard.shell.navigation')}><NavList nav={nav} /></nav>
        {sidebarFooter && <div className="sidebar__footer">{sidebarFooter}</div>}
      </aside>

      <div className="shell__main">
        <header className="topbar">{header}</header>
        {banners}
        <main id="main" className="content" tabIndex={-1}>
          <div key={location.pathname} className="content__inner route-fade"><Outlet /></div>
        </main>
      </div>

      <nav className="bottomnav" aria-label={t('dashboard.shell.navigation')}>
        <ul role="list">
          {mobilePrimary.map((n) => (
            <li key={n.id}>
              <NavLink to={n.to} end={n.end} className={({ isActive }) => `bottomnav__link ${isActive ? 'is-active' : ''}`}>
                <Icon name={n.icon} size={22} />
                <span>{n.label}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" className="bottomnav__link" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
              <Icon name="menu" size={22} />
              <span>{t('common.more')}</span>
            </button>
          </li>
        </ul>
      </nav>
      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} side="bottom" title={t('dashboard.shell.allSections')}>
        <nav className="sidenav sidenav--sheet" aria-label={t('dashboard.shell.allSections')}><NavList nav={rest} onNavigate={() => setMoreOpen(false)} /></nav>
        {moreContent}
      </Drawer>
    </div>
  );
}

export function ThemeToggle() {
  const t = useT('common');
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return (
    <IconButton
      icon={isDark ? 'sun' : 'moon'}
      label={`${t('common.theme.label')} : ${t(`common.theme.${isDark ? 'light' : 'dark'}`)}`}
      onClick={() => setTheme(isDark ? 'light' : theme === 'dark' ? 'light' : 'dark')}
    />
  );
}
