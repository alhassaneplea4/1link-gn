import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Input, LinkButton, Spinner } from '@/components/ui';
import { api } from '@/services/api';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { CodeSent, DeletionTarget } from '@/models/auth';
import { AuthHeading, PasswordInput } from './parts';
import { explainOtpError } from './otpErrors';

/**
 * Confirmation finale de la suppression du compte (lien reçu après 15 jours sans activité).
 * Mot de passe exigé ; un compte créé par code (sans mot de passe) confirme avec un code envoyé à son adresse.
 */
export default function ConfirmDeletionPage() {
  const t = useT('auth', 'common');
  useDocumentTitle(`${t('auth.deletion.title')} · 1Link`);
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [target, setTarget] = useState<DeletionTarget | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'done'>(token ? 'loading' : 'invalid');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    api.auth.getDeletionTarget(token).then(
      (r) => { if (live) { setTarget(r); setState('ready'); } },
      () => { if (live) setState('invalid'); },
    );
    return () => { live = false; };
  }, [token]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      setSent(await api.auth.requestDeletionCode(token));
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
      await api.auth.confirmAccountDeletion({ token, ...(target?.hasPassword ? { password } : { code }) });
      setState('done');
    } catch (e) {
      setError(explainOtpError(t, e));
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') return <div className="auth-state"><Spinner label={t('common.loading')} /></div>;
  if (state === 'invalid') {
    return (
      <>
        <AuthHeading title={t('auth.deletion.invalidTitle')} subtitle={t('auth.deletion.invalidText')} />
        <LinkButton to={paths.login} variant="gradient" size="lg" fullWidth>{t('auth.register.login')}</LinkButton>
      </>
    );
  }
  if (state === 'done') {
    return (
      <>
        <AuthHeading title={t('auth.deletion.doneTitle')} subtitle={t('auth.deletion.doneText')} />
        <LinkButton to={paths.home} variant="secondary" size="lg" fullWidth>{t('auth.signedOut.home')}</LinkButton>
      </>
    );
  }
  return (
    <>
      <AuthHeading title={t('auth.deletion.title')} subtitle={t('auth.deletion.subtitle', { name: target?.name ?? '' })} />
      <div className="auth-form">
        <Alert tone="danger">{t('auth.deletion.warning')}</Alert>
        {error && <Alert tone="danger">{error}</Alert>}
        {target?.hasPassword ? (
          <PasswordInput label={t('auth.fields.password')} name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus="" />
        ) : !sent ? (
          <Button variant="secondary" loading={busy} iconLeft="send" onClick={() => void sendCode()}>{t('auth.deletion.sendCode')}</Button>
        ) : (
          <>
            {sent.devCode && <Alert tone="warning" title={t('auth.dev.title')}>{t('auth.emailCode.dev')} <strong className="mono">{sent.devCode}</strong></Alert>}
            <Input label={t('auth.emailCode.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="otp-input" data-autofocus="" />
          </>
        )}
        <Button variant="danger" size="lg" fullWidth iconLeft="trash" loading={busy} disabled={target?.hasPassword ? !password : code.length !== 6} onClick={() => void confirm()}>{t('auth.deletion.confirm')}</Button>
        <p className="subtle auth-form__note">{t('auth.deletion.cancelHint')}</p>
      </div>
    </>
  );
}
