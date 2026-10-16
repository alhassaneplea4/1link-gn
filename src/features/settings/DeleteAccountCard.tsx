import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/overlays';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { paths } from '@/app/configuration/paths';
import { isApiError } from '@/models/api';
import { useSession } from '@/state/session';
import { formatDate } from '@/utilities/format';
import { explainOtpError } from '@/features/authentication/otpErrors';
import { useIdentity } from './IdentityField';

/**
 * Suppression du compte en deux temps (droit à l'effacement ; exigée aussi par les boutiques d'applications) :
 * demande confirmée par le mot de passe (ou un code), puis lien de confirmation finale envoyé après 15 jours sans activité.
 * Se reconnecter pendant ce délai annule la demande.
 */
export function DeleteAccountRow() {
  const t = useT('dashboard', 'auth', 'common');
  const navigate = useNavigate();
  const user = useSession((s) => s.session?.user);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const identity = useIdentity();
  if (!user) return null;

  const close = () => { setOpen(false); setError(null); identity.reset(); };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    useSession.getState().setLeaving(true);
    try {
      await api.auth.requestAccountDeletion(identity.proof);
      // Les sessions sont fermées par le serveur : la page « déconnecté » vide l'état local une fois affichée.
      void navigate(paths.signedOut, { replace: true });
    } catch (e) {
      useSession.getState().setLeaving(false);
      setError(isApiError(e) && e.message === 'admin_account' ? t('dashboard.settings.deleteAccount.admin') : isApiError(e) && e.message === 'payments_exist' ? t('dashboard.settings.deleteAccount.payments') : explainOtpError(t, e));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="settings__danger" data-testid="delete-account-row">
        <div>
          <strong>{t('dashboard.settings.deleteTitle')}</strong>
          <p className="muted">{t('dashboard.settings.deleteText')} <Link to={paths.deleteAccount}>{t('dashboard.settings.deleteAccount.details')}</Link></p>
          {user.deletionRequestedAt && <Alert tone="warning" title={t('dashboard.settings.deleteAccount.pendingTitle')}>{t('dashboard.settings.deleteAccount.pendingText', { date: formatDate(user.deletionRequestedAt) })}</Alert>}
        </div>
        <Button variant="danger" iconLeft="trash" onClick={() => setOpen(true)}>{t('dashboard.settings.delete')}</Button>
      </div>
      <ConfirmDialog
        open={open} onCancel={close} onConfirm={confirm} loading={busy} tone="danger" confirmDisabled={!identity.ready}
        title={t('dashboard.settings.deleteAccount.confirmTitle')} description={t('dashboard.settings.deleteAccount.confirmText')}
        confirmLabel={t('dashboard.settings.deleteAccount.confirm')}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        {identity.field}
      </ConfirmDialog>
    </>
  );
}
