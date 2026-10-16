import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Icon, Input } from '@/components/ui';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import type { MfaMethod, Session, TwoFactorChallenge } from '@/models/auth';
import { useSession } from '@/state/session';
import { explainOtpError } from './otpErrors';

interface Props {
  challenge: TwoFactorChallenge;
  onDone: (session: Session) => void;
  /** Retour à la première étape (jeton expiré ou abandon). */
  onBack: () => void;
}

type Method = MfaMethod | 'recovery';

/**
 * 2e étape de la connexion : la première étape (mot de passe, code e-mail ou SMS) est validée, il reste à prouver une seconde fois.
 * Les méthodes proposées sont celles que la personne a activées : SMS, e-mail, application d'authentification, code de secours.
 */
export function TwoFactorStep({ challenge, onDone, onBack }: Props) {
  const t = useT('auth', 'common');
  const completeTwoFactor = useSession((s) => s.completeTwoFactor);
  const [method, setMethod] = useState<Method>(challenge.method);
  const [devCode, setDevCode] = useState<string | undefined>(challenge.devCode);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(challenge.resendInSec);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recovery = method === 'recovery';
  const others: Method[] = [...challenge.methods, ...(challenge.methods.includes('totp') ? (['recovery'] as const) : [])].filter((m) => m !== method);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!recovery && !/^\d{6}$/.test(code)) return setError(t('auth.phone.errors.codeFormat'));
    if (recovery && code.replace(/[\s-]/g, '').length < 8) return setError(t('common.validation.required'));
    setError(null);
    setBusy(true);
    try {
      onDone(await completeTwoFactor(challenge.challenge, code.trim(), method));
    } catch (err) {
      setError(explainOtpError(t, err));
      if (isApiError(err) && err.message === 'invalid_challenge') onBack();
      if (isApiError(err) && (err.message === 'too_many_attempts' || err.message === 'code_expired' || err.message === 'expired')) setCode('');
      setBusy(false);
    }
  };

  /** Change de méthode ; SMS et e-mail envoient alors leur code. */
  const choose = async (next: Method) => {
    setMethod(next);
    setCode('');
    setError(null);
    setDevCode(undefined);
    if (next === 'sms' || next === 'email') {
      setBusy(true);
      try {
        const res = await api.auth.sendTwoFactorCode(challenge.challenge, next);
        setDevCode(res.devCode);
        setCooldown(res.resendInSec);
      } catch (err) {
        setError(explainOtpError(t, err));
      } finally {
        setBusy(false);
      }
    }
  };

  const resend = async () => {
    if (method !== 'sms' && method !== 'email') return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.sendTwoFactorCode(challenge.challenge, method);
      setDevCode(res.devCode);
      setCooldown(res.resendInSec);
      setCode('');
    } catch (err) {
      setError(explainOtpError(t, err));
    } finally {
      setBusy(false);
    }
  };

  const hint = method === 'sms' ? t('auth.twoFactor.hint', { phone: challenge.phoneMasked ?? '' })
    : method === 'email' ? t('auth.twoFactor.hintEmail', { email: challenge.emailMasked ?? '' })
      : method === 'totp' ? t('auth.twoFactor.hintTotp') : t('auth.twoFactor.hintRecovery');

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="auth-form" aria-label={t('auth.twoFactor.title')}>
      <p className="muted">{hint}</p>
      {devCode && (
        <Alert tone="warning" title={t('auth.dev.title')} action={<Button size="sm" variant="secondary" onClick={() => setCode(devCode)}>{t('auth.phone.dev.fill')}</Button>}>
          {t('auth.phone.dev.text')} <strong className="mono" aria-label={t('auth.phone.dev.codeLabel')}>{devCode}</strong>
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Input
        label={recovery ? t('auth.twoFactor.recoveryCode') : t('auth.phone.code')}
        value={code}
        onChange={(e) => setCode(recovery ? e.target.value.toUpperCase().slice(0, 12) : e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode={recovery ? 'text' : 'numeric'} autoComplete="one-time-code" pattern={recovery ? undefined : '[0-9]*'} maxLength={recovery ? 12 : 6} className="otp-input" required data-autofocus=""
      />
      <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy} disabled={recovery ? code.length < 8 : code.length !== 6} iconLeft="shield">{t('auth.twoFactor.submit')}</Button>
      <div className="auth-form__split">
        <Button type="button" variant="ghost" size="sm" iconLeft="arrow-left" onClick={onBack}>{t('auth.twoFactor.back')}</Button>
        {(method === 'sms' || method === 'email') && (
          <Button type="button" variant="ghost" size="sm" iconLeft="refresh" disabled={cooldown > 0 || busy} onClick={() => void resend()}>
            {cooldown > 0 ? t('auth.phone.resendIn', { s: cooldown }) : t('auth.phone.resend')}
          </Button>
        )}
      </div>
      {others.length > 0 && (
        <div className="auth-form__row" role="group" aria-label={t('auth.twoFactor.useOther')}>
          <span className="subtle">{t('auth.twoFactor.useOther')} :</span>
          {others.map((m) => <Button key={m} type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void choose(m)}>{t(`auth.twoFactor.methods.${m}`)}</Button>)}
        </div>
      )}
      <p className="subtle auth-form__note"><Icon name="info" size={13} /> {t('auth.twoFactor.note')}</p>
    </form>
  );
}
