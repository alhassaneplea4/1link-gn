import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Icon, LinkButton } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import type { AdminSection, Permission } from '@/models/auth';
import { useSession } from '@/state/session';
import { AppShell, ThemeToggle, type NavEntry } from './AppShell';
import { AccountMenu } from './header-parts';

type NavDef = { section: AdminSection; to: string; icon: NavEntry['icon']; group: 'pilot' | 'community' | 'revenue' | 'trust' | 'platform'; primaryMobile?: boolean; end?: boolean };

/** Rubriques de l'Admin Center. Ajouter une rubrique = une entrée ici + une route + des libellés. */
const NAV: NavDef[] = [
  { section: 'overview', to: paths.admin.root, icon: 'dashboard', group: 'pilot', primaryMobile: true, end: true },
  { section: 'realtime', to: paths.admin.realtime, icon: 'radio', group: 'pilot' },
  { section: 'users', to: paths.admin.users, icon: 'users', group: 'community', primaryMobile: true },
  { section: 'profiles', to: paths.admin.profiles, icon: 'file', group: 'community' },
  { section: 'analytics', to: paths.admin.analytics, icon: 'chart', group: 'community' },
  { section: 'subscriptions', to: paths.admin.subscriptions, icon: 'credit-card', group: 'revenue' },
  { section: 'payments', to: paths.admin.payments, icon: 'wallet', group: 'revenue', primaryMobile: true },
  { section: 'moderation', to: paths.admin.moderation, icon: 'scale', group: 'trust', primaryMobile: true },
  { section: 'reports', to: paths.admin.reports, icon: 'flag', group: 'trust' },
  { section: 'support', to: paths.admin.support, icon: 'lifebuoy', group: 'trust' },
  { section: 'security', to: paths.admin.security, icon: 'shield-check', group: 'platform' },
  { section: 'logs', to: paths.admin.logs, icon: 'scroll', group: 'platform' },
  { section: 'system', to: paths.admin.system, icon: 'server', group: 'platform' },
  { section: 'settings', to: paths.admin.settings, icon: 'settings', group: 'platform' },
];

export default function AdminLayout() {
  const t = useT('admin', 'common', 'dashboard');
  const session = useSession((s) => s.session);
  const perms = session?.permissions;
  const nav: NavEntry[] = useMemo(() => {
    const allowed = new Set(perms ?? []);
    return NAV.filter((n) => allowed.has(`${n.section}:read` as Permission)).map((n) => ({
      id: n.section, to: n.to, icon: n.icon, end: n.end, group: t(`admin.groups.${n.group}`), label: t(`admin.nav.${n.section}`), primaryMobile: n.primaryMobile,
    }));
  }, [perms, t]);
  const role = session?.user.adminRole;

  return (
    <AppShell
      variant="admin"
      brandLabel="Admin"
      nav={nav}
      header={
        <>
          <div className="topbar__grow adm-title">
            <strong>{t('admin.brand')}</strong>
            <Badge tone="success" dot>{t('admin.live')}</Badge>
          </div>
          <div className="topbar__actions">
            {session?.user.onboardingDone && <Link to={paths.dashboard.root} className="btn btn--ghost btn--sm"><Icon name="home" size={16} /><span className="btn__label">{t('admin.mySpace')}</span></Link>}
            <ThemeToggle />
            <AccountMenu />
          </div>
        </>
      }
      sidebarFooter={
        <div className="sidebar-plan">
          <span className="eyebrow" style={{ color: '#9db6ff' }}>{t('admin.yourRole')}</span>
          <strong>{role ? t(`common.roles.${role}`) : '—'}</strong>
          <small>{t('admin.permissionsCount', { count: perms?.length ?? 0 })}</small>
          <LinkButton to={paths.admin.security} size="sm" variant="secondary">{t('admin.seeRights')}</LinkButton>
        </div>
      }
    />
  );
}
