import { Card, Icon, LinkButton } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';

/**
 * Écran affiché à la place de l'Admin Center quand la session d'un administrateur a été ouverte avec UN SEUL facteur. Le serveur refuse
 * de toute façon chaque route d'administration (`admin_mfa_required`) : cet écran explique pourquoi et mène à la page Sécurité, où
 * l'application d'authentification ou une clé d'accès renforce aussitôt la session.
 */
export function AdminMfaGate() {
  const t = useT('admin');
  return (
    <div className="admin-gate" data-testid="admin-mfa-gate">
      <Card padding="lg" className="admin-gate__card">
        <h1><Icon name="shield-check" size={22} /> {t('admin.mfaGate.title')}</h1>
        <p>{t('admin.mfaGate.text')}</p>
        <p className="muted">{t('admin.mfaGate.steps')}</p>
        <div className="admin-gate__actions">
          <LinkButton to={paths.dashboard.security} variant="gradient" iconLeft="fingerprint">{t('admin.mfaGate.cta')}</LinkButton>
          <LinkButton to={paths.signOut} variant="ghost" iconLeft="logout">{t('admin.mfaGate.signOut')}</LinkButton>
        </div>
      </Card>
    </div>
  );
}
