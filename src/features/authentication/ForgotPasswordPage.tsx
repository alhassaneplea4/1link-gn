import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Icon, Input, LinkButton } from '@/components/ui';
import { api } from '@/services/api';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { isEmail } from '@/utilities/validation';
import { AuthHeading, authErrorKey } from './parts';

export default function ForgotPasswordPage() {
  const t = useT('auth', 'common');
  useDocumentTitle(`${t('auth.forgot.title')} · 1Link`);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    if (!isEmail(email)) return setError(t('common.validation.email'));
    setError(undefined);
    setBusy(true);
    try {
      await api.auth.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setFormError(t(authErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-state">
        <span className="auth-state__icon"><Icon name="mail" size={28} /></span>
        <AuthHeading title={t('auth.forgot.sentTitle')} subtitle={t('auth.forgot.sentText', { email })} />
        <LinkButton to={paths.login} variant="ghost" iconLeft="arrow-left">{t('auth.forgot.back')}</LinkButton>
      </div>
    );
  }
  return (
    <>
      <AuthHeading title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} />
      <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input label={t('auth.fields.email')} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} required />
        <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy}>{t('auth.forgot.submit')}</Button>
      </form>
      <p className="auth-alt"><Link to={paths.login}>{t('auth.forgot.back')}</Link></p>
    </>
  );
}
