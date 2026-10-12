import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Input } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/overlays';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { paths } from '@/app/configuration/paths';
import { isApiError } from '@/models/api';
import type { OtpRequestResult } from '@/models/auth';
import { useSession } from '@/state/session';
import { resetUserScopedState } from '@/state/lifecycle';
import { PasswordInput } from '@/features/authentication/parts';
import { explainOtpError } from '@/features/authentication/otpErrors';

/**
 * Suppression définitive du compte (droit à l'effacement ; exigée aussi par les boutiques d'applications).
 * Confirmée par le mot de passe, ou par un code SMS pour un compte créé par téléphone (sans mot de passe).
 */
export function DeleteAccountRow() {
  const t = useT('dashboard', 'auth', 'common');
  const navigate = useNavigate();
  const user = useSession((s) => s.session?.user);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otp, setOtp] = useState<OtpRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const withPassword = Boolean(user.email);

  const close = () => { setOpen(false); setPassword(''); setCode(''); setOtp(null); setError(null); };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      setOtp(await api.auth.requestAccountDeletionCode());
    } catch (e) {
      setError(explainOtpError(t, e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.auth.deleteAccount(withPassword ? { password } : { code });
      // On quitte d'abord l'espace protégé : vider la session avant ferait rediriger vers la connexion.
      await navigate(paths.signedOut, { replace: true });
      resetUserScopedState();
      useSession.setState({ status: 'anonymous', session: null });
    } catch (e) {
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
        </div>
        <Button variant="danger" iconLeft="trash" onClick={() => setOpen(true)}>{t('dashboard.settings.delete')}</Button>
      </div>
      <ConfirmDialog
        open={open} onCancel={close} onConfirm={confirm} loading={busy} tone="danger"
        title={t('dashboard.settings.deleteAccount.confirmTitle')} description={t('dashboard.settings.deleteAccount.confirmText')}
        confirmLabel={t('dashboard.settings.deleteAccount.confirm')} confirmDisabled={withPassword ? !password : code.length !== 6}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        {withPassword ? (
          <PasswordInput label={t('dashboard.security.confirmWithPassword')} name="delete-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus="" />
        ) : !otp ? (
          <Button variant="secondary" loading={busy} onClick={() => void sendCode()}>{t('dashboard.settings.deleteAccount.sendCode')}</Button>
        ) : (
          <Input label={t('auth.phone.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="otp-input" data-autofocus="" hint={otp.devCode ? `${t('auth.phone.dev.text')} ${otp.devCode}` : undefined} />
        )}
      </ConfirmDialog>
    </>
  );
}
