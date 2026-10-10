import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Icon, Input, LinkButton, PageHeader } from '@/components/ui';
import { env } from '@/app/configuration/env';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useSession } from '@/state/session';
import { formatDateTime } from '@/utilities/format';
import { accountContact, isContactVerified } from '@/models/auth';
import './settings.css';

/**
 * Sécurité du compte. Seules les informations réellement fournies par la session sont affichées ;
 * le reste est signalé comme non connecté (aucune action de sécurité n'est simulée).
 */
export default function SecurityPage() {
  const t = useT('dashboard', 'auth', 'common');
  useDocumentTitle(`${t('dashboard.nav.security')} · 1Link`);
  const session = useSession((s) => s.session);
  if (!session) return null;
  const { user } = session;
  return (
    <div className="settings">
      <PageHeader title={t('dashboard.nav.security')} description={t('dashboard.security.description')} />
      <div className="settings__grid">
        <Card padding="lg" className="settings__card">
          <h2><Icon name={user.email ? 'mail' : 'phone'} size={18} /> {user.email ? t('dashboard.security.emailTitle') : t('dashboard.security.phoneTitle')}</h2>
          <p className="settings__status">
            <Badge tone={isContactVerified(user) ? 'success' : 'warning'} dot>{isContactVerified(user) ? t('dashboard.settings.verified') : t('dashboard.settings.unverified')}</Badge>
            <span className="muted">{accountContact(user)}</span>
          </p>
          {!isContactVerified(user) && <LinkButton to={paths.verifyEmail} variant="gradient" size="sm">{t('dashboard.shell.verifyCta')}</LinkButton>}
        </Card>

        <Card padding="lg" className="settings__card">
          <h2><Icon name="key" size={18} /> {t('dashboard.security.passwordTitle')}</h2>
          {env.isDemo && <Alert tone="warning" title={t('auth.demo.title')}>{t('dashboard.security.passwordDemo')}</Alert>}
          <Input label={t('auth.fields.password')} type="password" value="" placeholder="••••••••" disabled readOnly />
          <Button variant="secondary" disabled>{t('dashboard.security.changePassword')}</Button>
          <Link to={paths.forgotPassword} className="subtle">{t('auth.login.forgot')}</Link>
        </Card>

        <Card padding="lg" className="settings__card">
          <h2><Icon name="monitor" size={18} /> {t('dashboard.security.sessionTitle')}</h2>
          <dl className="kv">
            <div><dt>{t('dashboard.security.sessionEnds')}</dt><dd>{formatDateTime(session.expiresAt)}</dd></div>
            <div><dt>{t('dashboard.security.sessionSource')}</dt><dd>{session.demo ? t('common.demo') : t('dashboard.security.live')}</dd></div>
          </dl>
          <LinkButton to={paths.signOut} variant="secondary" iconLeft="logout">{t('dashboard.shell.signOut')}</LinkButton>
        </Card>

        <Card padding="lg" className="settings__card">
          <h2><Icon name="fingerprint" size={18} /> {t('dashboard.security.twoFactorTitle')}</h2>
          <p className="muted">{t('dashboard.security.twoFactorText')}</p>
          <Badge tone="neutral">{t('dashboard.overview.soon')}</Badge>
        </Card>
      </div>
    </div>
  );
}
