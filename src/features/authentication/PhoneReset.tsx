import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Icon, Input, LinkButton } from '@/components/ui';
import { api } from '@/services/api';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import type { OtpRequestResult } from '@/models/auth';
import { DEFAULT_DIAL, maskPhone, normalizePhone } from '@/utilities/phone';
import { AuthHeading, PasswordInput } from './parts';
import { PhoneField } from './PhoneField';
import { explainOtpError } from './otpErrors';

type Step = 'phone' | 'reset' | 'done';

/**
 * Réinitialisation du mot de passe par SMS : numéro → code reçu + nouveau mot de passe.
 * Le serveur répond de la même façon qu'un compte existe ou non (aucune énumération de numéros).
 */
export function PhoneReset() {
  const t = useT('auth', 'common');
  const [step, setStep] = useState<Step>('phone');
  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [national, setNational] = useState('');
  const [e164, setE164] = useState('');
  const [otp, setOtp] = useState<OtpRequestResult | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; code?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let live = true;
    api.auth.getCapabilities().then((caps) => { if (live) setUnavailable(!caps.otpChannels.includes('sms')); }, () => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const normalized = normalizePhone(national, dial);
    setFormError(null);
    if (!normalized) return setErrors({ phone: t('auth.phone.errors.invalidPhone') });
    setErrors({});
    setBusy(true);
    try {
      const res = await api.auth.requestPhoneReset(normalized);
      setE164(normalized);
      setOtp(res);
      setCooldown(res.resendInSec);
      setCode('');
      setStep('reset');
    } catch (err) {
      setFormError(explainOtpError(t, err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const res = await api.auth.requestPhoneReset(e164);
      setOtp(res);
      setCooldown(res.resendInSec);
    } catch (err) {
      setFormError(explainOtpError(t, err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: typeof errors = {};
    if (!/^\d{6}$/.test(code)) errs.code = t('auth.phone.errors.codeFormat');
    if (password.length < 8) errs.password = t('common.validation.passwordShort');
    if (confirm !== password) errs.confirm = t('auth.errors.passwordMismatch');
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.auth.resetPasswordByPhone({ phone: e164, code, password });
      setStep('done');
    } catch (err) {
      setFormError(explainOtpError(t, err));
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="auth-state">
        <span className="auth-state__icon auth-state__icon--ok"><Icon name="check-circle" size={28} /></span>
        <AuthHeading title={t('auth.reset.doneTitle')} subtitle={t('auth.reset.doneText')} />
        <LinkButton to={paths.login} variant="gradient">{t('auth.login.submit')}</LinkButton>
      </div>
    );
  }

  if (step === 'reset') {
    return (
      <form onSubmit={(e) => void reset(e)} noValidate className="auth-form" aria-label={t('auth.forgot.phoneResetTitle')}>
        <p className="muted">{t('auth.forgot.phoneCodeHint', { phone: maskPhone(e164) })}</p>
        {otp?.devCode && (
          <Alert tone="warning" title={t('auth.dev.title')} action={<Button size="sm" variant="secondary" onClick={() => setCode(otp.devCode!)}>{t('auth.phone.dev.fill')}</Button>}>
            {t('auth.phone.dev.text')} <strong className="mono" aria-label={t('auth.phone.dev.codeLabel')}>{otp.devCode}</strong>
          </Alert>
        )}
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input
          label={t('auth.phone.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} error={errors.code}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} className="otp-input" required data-autofocus=""
        />
        <PasswordInput label={t('auth.fields.newPassword')} name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} required />
        <PasswordInput label={t('auth.fields.confirmPassword')} name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} required />
        <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy}>{t('auth.reset.submit')}</Button>
        <div className="auth-form__split">
          <Button type="button" variant="ghost" size="sm" iconLeft="arrow-left" onClick={() => { setStep('phone'); setFormError(null); }}>{t('auth.phone.change')}</Button>
          <Button type="button" variant="ghost" size="sm" iconLeft="refresh" disabled={cooldown > 0 || busy} onClick={() => void resend()}>
            {cooldown > 0 ? t('auth.phone.resendIn', { s: cooldown }) : t('auth.phone.resend')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void send(e)} noValidate className="auth-form">
      {formError && <Alert tone="danger">{formError}</Alert>}
      {unavailable && <Alert tone="warning">{t('auth.phone.errors.unavailable')}</Alert>}
      <PhoneField dial={dial} national={national} onDial={setDial} onNational={setNational} error={errors.phone} />
      <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy} disabled={unavailable} iconLeft="send">{t('auth.forgot.phoneSubmit')}</Button>
    </form>
  );
}
