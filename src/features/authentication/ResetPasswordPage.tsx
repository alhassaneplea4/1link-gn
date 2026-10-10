import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Icon, LinkButton } from '@/components/ui';
import { api } from '@/services/api';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { AuthHeading, PasswordInput, authErrorKey } from './parts';

export default function ResetPasswordPage() {
  const t = useT('auth', 'common');
  useDocumentTitle(`${t('auth.reset.title')} · 1Link`);
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || formError === t('auth.errors.invalidToken')) {
    return (
      <div className="auth-state">
        <span className="auth-state__icon auth-state__icon--bad"><Icon name="x-circle" size={28} /></span>
        <AuthHeading title={t('auth.reset.invalidTitle')} subtitle={t('auth.reset.invalidText')} />
        <LinkButton to={paths.forgotPassword} variant="gradient">{t('auth.reset.requestNew')}</LinkButton>
      </div>
    );
  }
  if (done) {
    return (
      <div className="auth-state">
        <span className="auth-state__icon auth-state__icon--ok"><Icon name="check-circle" size={28} /></span>
        <AuthHeading title={t('auth.reset.doneTitle')} subtitle={t('auth.reset.doneText')} />
        <LinkButton to={paths.login} variant="gradient">{t('auth.login.submit')}</LinkButton>
      </div>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: typeof errors = {};
    if (password.length < 8) errs.password = t('common.validation.passwordShort');
    if (confirm !== password) errs.confirm = t('auth.errors.passwordMismatch');
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setFormError(t(authErrorKey(err)));
      setBusy(false);
    }
  };
  return (
    <>
      <AuthHeading title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} />
      <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <PasswordInput label={t('auth.fields.newPassword')} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} required />
        <PasswordInput label={t('auth.fields.confirmPassword')} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} required />
        <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy}>{t('auth.reset.submit')}</Button>
      </form>
    </>
  );
}
