import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Input } from '@/components/ui';
import { api } from '@/services/api';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useSession } from '@/state/session';
import { isEmail } from '@/utilities/validation';
import { AuthHeading, PasswordInput, authErrorKey, useNextPath } from './parts';

export default function LoginPage() {
  const t = useT('auth', 'common');
  useDocumentTitle(`${t('auth.login.title')} · 1Link`);
  const signIn = useSession((s) => s.signIn);
  const navigate = useNavigate();
  const next = useNextPath();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return; // prévention des doubles soumissions
    const next_: typeof errors = {};
    if (!isEmail(email)) next_.email = t('common.validation.email');
    if (!password) next_.password = t('common.validation.required');
    setErrors(next_);
    setFormError(null);
    if (Object.keys(next_).length) return;
    setBusy(true);
    try {
      const session = await signIn(email, password);
      const dest = next ?? (!session.user.onboardingDone ? paths.onboarding : session.user.adminRole ? paths.admin.root : paths.dashboard.root);
      navigate(dest, { replace: true });
    } catch (err) {
      setFormError(t(authErrorKey(err)));
      setBusy(false);
    }
  };

  return (
    <>
      <AuthHeading title={t('auth.login.title')} subtitle={t('auth.login.subtitle')} />
      {api.auth.demoAccounts && (
        <section className="demo-box" aria-labelledby="demo-accounts">
          <div className="demo-box__head"><Badge tone="warning" icon="flask">{t('auth.demo.title')}</Badge></div>
          <p>{t('auth.demo.text')}</p>
          <h2 id="demo-accounts" className="sr-only">{t('auth.demo.accounts')}</h2>
          <ul role="list" className="demo-box__list">
            {api.auth.demoAccounts.map((a) => (
              <li key={a.id}>
                <button type="button" className="demo-chip" onClick={() => { setEmail(a.email); setPassword('demo-password'); setErrors({}); }} title={a.description}>
                  <strong>{a.label}</strong><small>{a.email}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input label={t('auth.fields.email')} type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
        <PasswordInput label={t('auth.fields.password')} name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} required />
        <div className="auth-form__row"><Link to={paths.forgotPassword}>{t('auth.login.forgot')}</Link></div>
        <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy}>{t('auth.login.submit')}</Button>
      </form>
      <p className="auth-alt">{t('auth.login.noAccount')} <Link to={paths.register}>{t('auth.login.register')}</Link></p>
    </>
  );
}
