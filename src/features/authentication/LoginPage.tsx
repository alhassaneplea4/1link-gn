import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Input } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useSession } from '@/state/session';
import { isEmail } from '@/utilities/validation';
import { AuthHeading, MethodSwitch, PasswordInput, afterAuthPath, authErrorKey, useNextPath, type AuthMethod } from './parts';
import { PhoneAuth } from './PhoneAuth';
import { EmailCodeAuth } from './EmailCodeAuth';
import { TwoFactorStep } from './TwoFactorStep';
import { explainOtpError } from './otpErrors';
import { isApiError } from '@/models/api';
import type { TwoFactorChallenge } from '@/models/auth';

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
  const [method, setMethod] = useState<AuthMethod>('email');
  // Par défaut un code est envoyé par e-mail ; le mot de passe reste possible pour les comptes qui en ont un.
  const [withPassword, setWithPassword] = useState(false);
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);

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
      const result = await signIn(email, password);
      if (result.kind === 'two_factor') {
        setChallenge(result.challenge);
        setBusy(false);
        return;
      }
      navigate(afterAuthPath(result.session, next), { replace: true });
    } catch (err) {
      const rateLimited = isApiError(err) && (err.message === 'resend_too_soon' || err.message === 'too_many_requests');
      setFormError(rateLimited ? explainOtpError(t, err) : t(authErrorKey(err)));
      setBusy(false);
    }
  };

  if (challenge) {
    return (
      <>
        <AuthHeading title={t('auth.twoFactor.title')} subtitle={t('auth.twoFactor.subtitle')} />
        <TwoFactorStep challenge={challenge} onDone={(session) => navigate(afterAuthPath(session, next), { replace: true })} onBack={() => { setChallenge(null); setPassword(''); }} />
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t('auth.login.title')} subtitle={t('auth.login.subtitle')} />
      <MethodSwitch value={method} onChange={setMethod} />
      {method === 'phone' ? <PhoneAuth mode="sign_in" onDone={(session) => navigate(afterAuthPath(session, next), { replace: true })} /> : !withPassword ? (
        <>
          <EmailCodeAuth mode="sign_in" onDone={(session) => navigate(afterAuthPath(session, next), { replace: true })} onTwoFactor={setChallenge} />
          <p className="auth-alt"><button type="button" className="linklike" onClick={() => setWithPassword(true)}>{t('auth.emailCode.passwordInstead')}</button></p>
        </>
      ) : (
      <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input label={t('auth.fields.email')} type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
        <PasswordInput label={t('auth.fields.password')} name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} required />
        <div className="auth-form__row"><Link to={paths.forgotPassword}>{t('auth.login.forgot')}</Link></div>
        <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy}>{t('auth.login.submit')}</Button>
        <p className="auth-alt"><button type="button" className="linklike" onClick={() => setWithPassword(false)}>{t('auth.emailCode.codeInstead')}</button></p>
      </form>
      )}
      <p className="auth-alt">{t('auth.login.noAccount')} <Link to={paths.register}>{t('auth.login.register')}</Link></p>
    </>
  );
}
