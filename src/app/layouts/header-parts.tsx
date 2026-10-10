import { accountContact, isContactVerified } from '@/models/auth';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Dropdown, Icon, IconButton, type MenuItem } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { LOCALES, useLocale, useT } from '@/i18n/core';
import { useSession } from '@/state/session';
import { Link } from 'react-router-dom';

export function VerifyBanner() {
  const t = useT('dashboard');
  const verified = useSession((s) => (s.session ? isContactVerified(s.session.user) : true));
  if (verified) return null;
  return (
    <div className="banner banner--verify" role="status">
      <Icon name="mail" size={16} />
      <span>{t('dashboard.shell.unverified')}</span>
      <Link to={paths.verifyEmail} className="btn btn--secondary btn--sm"><span className="btn__label">{t('dashboard.shell.verifyCta')}</span></Link>
    </div>
  );
}

export function AccountMenu({ extraItems = [] }: { extraItems?: MenuItem[] }) {
  const t = useT('common', 'dashboard');
  const navigate = useNavigate();
  const user = useSession((s) => s.session?.user);
  const { locale, setLocale } = useLocale();
  if (!user) return null;
  const items: MenuItem[] = [
    ...extraItems,
    ...LOCALES.map((l, i) => ({ id: `lang-${l.id}`, label: l.label, icon: 'languages' as const, description: l.id === locale ? '✓' : undefined, separatorBefore: i === 0, onSelect: () => void setLocale(l.id) })),
    { id: 'signout', label: t('dashboard.shell.signOut'), icon: 'logout', separatorBefore: true, danger: true, onSelect: () => navigate(paths.signOut) },
  ];
  return (
    <Dropdown
      align="end"
      header={<div><strong>{user.name}</strong><div className="subtle" style={{ fontSize: 'var(--text-xs)' }}>{accountContact(user)}</div>{user.adminRole && <Badge tone="violet" className="" icon="shield">{t(`common.roles.${user.adminRole}`)}</Badge>}</div>}
      items={items}
      trigger={
        <button type="button" className="account-btn" aria-label={t('dashboard.shell.accountMenu')}>
          <Avatar name={user.name} size={34} />
          <span className="account-btn__name">{user.name}</span>
          <Icon name="chevron-down" size={16} />
        </button>
      }
    />
  );
}

export function Notifications({ items }: { items: { id: string; icon: 'alert' | 'mail' | 'rocket' | 'info'; title: string; text: string; to?: string }[] }) {
  const t = useT('dashboard');
  const navigate = useNavigate();
  return (
    <Dropdown
      align="end"
      header={<strong>{t('dashboard.shell.notifications')}</strong>}
      items={items.length ? items.map((n) => ({ id: n.id, label: n.title, description: n.text, icon: n.icon, onSelect: () => n.to && navigate(n.to) })) : [{ id: 'none', label: t('dashboard.shell.noNotifications'), disabled: true, icon: 'check-circle' }]}
      trigger={<IconButton icon="bell" label={t('dashboard.shell.notifications')} className={items.length ? 'notif-dot' : undefined} />}
    />
  );
}
