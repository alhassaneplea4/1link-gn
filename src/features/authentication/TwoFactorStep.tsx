import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Icon, Input } from '@/components/ui';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import type { OtpRequestResult, Session, TwoFactorChallenge } from '@/models/auth';
import { useSession } from '@/state/session';
import { explainOtpError } from './otpErrors';

interface Props {
  challenge: TwoFactorChallenge;
  onDone: (session: Session) => void;
  /** Retour à la saisie du mot de passe (jeton expiré ou abandon). */
  onBack: () => void;
}

/** 2e étape de la connexion : le mot de passe est correct, il reste à saisir le code reçu par SMS. */
export function TwoFactorStep({ challenge, onDone, onBack }: Props) {
  const t = useT('auth', 'common');
  const completeTwoFactor = useSession((s) => s.completeTwoFactor);
  const [otp, setOtp] = useState<Pick<OtpRequestResult, 'devCode'>>({ devCode: challenge.devCode });
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(challenge.resendInSec);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) return setError(t('auth.phone.errors.codeFormat'));
    setError(null);
    setBusy(true);
    try {
      onDone(await completeTwoFactor(challenge.challenge, code));
    } catch (err) {
      setError(explainOtpError(t, err));
      if (isApiError(err) && err.message === 'invalid_challenge') onBack();
      if (isApiError(err) && (err.message === 'too_many_attempts' || err.message === 'code_expired' || err.message === 'expired')) setCode('');
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.resendTwoFactor(challenge.challenge);
      setOtp({ devCode: res.devCode });
      setCooldown(res.resendInSec);
      setCode('');
    } catch (err) {
      setError(explainOtpError(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="auth-form" aria-label={t('auth.twoFactor.title')}>
      <p className="muted">{t('auth.twoFactor.hint', { phone: challenge.phoneMasked })}</p>
      {otp.devCode && (
        <Alert tone="warning" title={t('auth.dev.title')} action={<Button size="sm" variant="secondary" onClick={() => setCode(otp.devCode!)}>{t('auth.phone.dev.fill')}</Button>}>
          {t('auth.phone.dev.text')} <strong className="mono" aria-label={t('auth.phone.dev.codeLabel')}>{otp.devCode}</strong>
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Input
        label={t('auth.phone.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} className="otp-input" required data-autofocus=""
      />
      <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy} disabled={code.length !== 6} iconLeft="shield">{t('auth.twoFactor.submit')}</Button>
      <div className="auth-form__split">
        <Button type="button" variant="ghost" size="sm" iconLeft="arrow-left" onClick={onBack}>{t('auth.twoFactor.back')}</Button>
        <Button type="button" variant="ghost" size="sm" iconLeft="refresh" disabled={cooldown > 0 || busy} onClick={() => void resend()}>
          {cooldown > 0 ? t('auth.phone.resendIn', { s: cooldown }) : t('auth.phone.resend')}
        </Button>
      </div>
      <p className="subtle auth-form__note"><Icon name="info" size={13} /> {t('auth.twoFactor.note')}</p>
    </form>
  );
}
