import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Checkbox, Icon, Input } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import type { CodeSent, Session, TwoFactorChallenge } from '@/models/auth';
import { useSession } from '@/state/session';
import { isEmail } from '@/utilities/validation';
import { explainOtpError } from './otpErrors';

interface Props {
  /** `sign_up` demande l'acceptation explicite des conditions ; `sign_in` la rappelle seulement. */
  mode: 'sign_in' | 'sign_up';
  onDone: (session: Session) => void;
  onTwoFactor?: (challenge: TwoFactorChallenge) => void;
}

/**
 * Inscription ET connexion sans mot de passe : l'adresse e-mail reçoit un code à 6 chiffres.
 * L'interface ne révèle jamais si l'adresse a déjà un compte avant la preuve de possession (code correct).
 */
export function EmailCodeAuth({ mode, onDone, onTwoFactor }: Props) {
  const t = useT('auth', 'common');
  const setSession = useSession((s) => s.setSession);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [errors, setErrors] = useState<{ email?: string; terms?: string; code?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const request = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const found: typeof errors = {};
    if (!isEmail(email)) found.email = t('common.validation.email');
    if (mode === 'sign_up' && !terms) found.terms = t('auth.errors.termsRequired');
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const res = await api.auth.requestEmailCode(email.trim().toLowerCase());
      setSent(res);
      setCooldown(res.resendInSec);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(explainOtpError(t, err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) return setErrors({ code: t('auth.phone.errors.codeFormat') });
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      const result = await api.auth.verifyEmailCode({ email: email.trim().toLowerCase(), code });
      if (result.kind === 'two_factor') {
        setBusy(false);
        onTwoFactor?.(result.challenge);
        return;
      }
      setSession(result.session);
      onDone(result.session);
    } catch (err) {
      setError(explainOtpError(t, err));
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.requestEmailCode(email.trim().toLowerCase());
      setSent(res);
      setCooldown(res.resendInSec);
      setCode('');
    } catch (err) {
      setError(explainOtpError(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'code') {
    return (
      <form onSubmit={(e) => void verify(e)} noValidate className="auth-form" aria-label={t('auth.emailCode.verify')}>
        <p className="muted">{t('auth.emailCode.sentHint', { email: email.trim().toLowerCase() })}</p>
        {sent?.devCode && (
          <Alert tone="warning" title={t('auth.dev.title')} action={<Button size="sm" variant="secondary" onClick={() => setCode(sent.devCode!)}>{t('auth.phone.dev.fill')}</Button>}>
            {t('auth.emailCode.dev')} <strong className="mono" aria-label={t('auth.phone.dev.codeLabel')}>{sent.devCode}</strong>
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <Input
          label={t('auth.emailCode.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} error={errors.code}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} className="otp-input" required data-autofocus=""
        />
        <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy} disabled={code.length !== 6}>{t('auth.emailCode.verify')}</Button>
        <div className="auth-form__split">
          <Button type="button" variant="ghost" size="sm" iconLeft="arrow-left" onClick={() => { setStep('email'); setError(null); }}>{t('auth.emailCode.change')}</Button>
          <Button type="button" variant="ghost" size="sm" iconLeft="refresh" disabled={cooldown > 0 || busy} onClick={() => void resend()}>
            {cooldown > 0 ? t('auth.emailCode.resendIn', { s: cooldown }) : t('auth.emailCode.resend')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void request(e)} noValidate className="auth-form">
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label={t('auth.fields.email')} type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
      {mode === 'sign_up' ? (
        <>
          <Checkbox label={t('auth.register.terms')} checked={terms} onChange={(e) => setTerms(e.target.checked)} error={errors.terms} />
          <p className="subtle auth-form__note"><Link to={paths.terms} target="_blank">{t('auth.register.readTerms')}</Link> · <Link to={paths.privacy} target="_blank">{t('auth.register.readPrivacy')}</Link></p>
        </>
      ) : (
        <p className="subtle auth-form__note">{t('auth.emailCode.continueNote')}</p>
      )}
      <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy} iconLeft="send">{t('auth.emailCode.send')}</Button>
      <p className="subtle auth-form__note"><Icon name="info" size={13} /> {t('auth.emailCode.noPassword')}</p>
    </form>
  );
}
