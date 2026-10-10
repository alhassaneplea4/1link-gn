import { Alert, Badge, Card, PageHeader, Toggle } from '@/components/ui';
import { PLANS } from '@/app/configuration/plans';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { formatCurrency, formatNumber } from '@/utilities/format';
import { RESERVED_USERNAMES } from '@/utilities/validation';
import { useCanWrite } from '../shared';

/** Paramètres de plateforme : lecture de la configuration front ; l'écriture n'est pas connectée à un serveur. */
export default function AdminSettingsPage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.settings')} · Admin Center`);
  const canWrite = useCanWrite('settings');
  return (
    <div className="adm-stack">
      <PageHeader title={t('admin.nav.settings')} description={t('admin.settings.description')} />
      <Alert tone="info">{canWrite ? t('admin.settings.writeNotConnected') : t('admin.settings.readOnly')}</Alert>
      <Card padding="lg">
        <h2 className="adm-section-title">{t('admin.settings.flags')}</h2>
        <div className="adm-stack">
          <Toggle label={t('admin.settings.maintenance')} hint={t('admin.settings.notConnected')} checked={false} onChange={() => undefined} disabled />
          <Toggle label={t('admin.settings.registrations')} hint={t('admin.settings.notConnected')} checked onChange={() => undefined} disabled />
        </div>
      </Card>
      <Card padding="lg">
        <h2 className="adm-section-title">{t('admin.settings.plans')}</h2>
        <p className="muted">{t('admin.settings.plansText')}</p>
        <div className="dtable__scroll" style={{ marginTop: 'var(--space-3)' }}>
          <table className="dtable__table">
            <caption className="sr-only">{t('admin.settings.plans')}</caption>
            <thead><tr><th scope="col">{t('admin.users.plan')}</th><th scope="col" className="is-end">/ mois</th><th scope="col" className="is-end">/ an</th><th scope="col" className="is-end">{t('admin.settings.maxBlocks')}</th></tr></thead>
            <tbody>
              {PLANS.map((p) => <tr key={p.id}><th scope="row" style={{ textTransform: 'none' }}>{t(`common.plans.${p.id}`)}</th><td className="is-end">{formatCurrency(p.price.monthly, p.price.currency)}</td><td className="is-end">{formatCurrency(p.price.yearly, p.price.currency)}</td><td className="is-end">{p.limits.maxBlocks ? formatNumber(p.limits.maxBlocks) : '∞'}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>
      <Card padding="lg">
        <h2 className="adm-section-title">{t('admin.settings.reserved')}</h2>
        <p className="muted">{t('admin.settings.reservedText')}</p>
        <div className="adm-chipwrap" style={{ marginTop: 'var(--space-3)' }}>{[...RESERVED_USERNAMES].sort().map((u) => <Badge key={u}>{u}</Badge>)}</div>
      </Card>
    </div>
  );
}
