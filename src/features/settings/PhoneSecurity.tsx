import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Icon, Input } from '@/components/ui';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { useSession } from '@/state/session';
import type { OtpRequestResult } from '@/models/auth';
import { DEFAULT_DIAL, formatInternational, normalizePhone } from '@/utilities/phone';
import { PhoneField } from '@/features/authentication/PhoneField';
import { PasswordInput } from '@/features/authentication/parts';
import { explainOtpError } from '@/features/authentication/otpErrors';

type Step = 'idle' | 'phone' | 'code';

/**
 * Numéro de téléphone du compte et double authentification par SMS.
 * L'ajout d'un numéro exige la preuve de possession (code reçu) ; activer/désactiver la double authentification
 * ou retirer le numéro exige le mot de passe. Aucun état n'est conservé côté navigateur : tout vient de la session serveur.
 */
export function PhoneSecurity() {
  const t = useT('dashboard', 'auth', 'common');
  const session = useSession((s) => s.session);
  const setSession = useSession((s) => s.setSession);
  const [step, setStep] = useState<Step>('idle');
  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [national, setNational] = useState('');
  const [e164, setE164] = useState('');
  const [otp, setOtp] = useState<OtpRequestResult | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(true);

  useEffect(() => {
    let live = true;
    api.auth.getCapabilities().then((caps) => { if (live) setSmsAvailable(caps.otpChannels.includes('sms')); }, () => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (!session) return null;
  const { user } = session;
  const hasPassword = Boolean(user.email); // les comptes créés par téléphone n'ont pas de mot de passe
  const phone = user.phone ?? null;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(explainOtpError(t, err));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    const normalized = normalizePhone(national, dial);
    if (!normalized) return setFieldError(t('auth.phone.errors.invalidPhone'));
    setFieldError(undefined);
    void run(async () => {
      const res = await api.auth.requestPhoneLink({ phone: normalized, channel: 'sms' });
      setE164(normalized);
      setOtp(res);
      setCooldown(res.resendInSec);
      setCode('');
      setStep('code');
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setFieldError(t('auth.phone.errors.codeFormat'));
    setFieldError(undefined);
    void run(async () => {
      setSession(await api.auth.verifyPhoneLink({ phone: e164, code }));
      setStep('idle');
      setNational('');
      setNotice(t('dashboard.security.phoneLinked'));
    });
  };

  const toggleTwoFactor = (enabled: boolean) => {
    if (!password) return setFieldError(t('common.validation.required'));
    setFieldError(undefined);
    void run(async () => {
      setSession(await api.auth.setTwoFactor(enabled, password));
      setPassword('');
      setNotice(enabled ? t('dashboard.security.twoFactorOn') : t('dashboard.security.twoFactorOff'));
    });
  };

  const removePhone = () => {
    if (!password) return setFieldError(t('common.validation.required'));
    setFieldError(undefined);
    void run(async () => {
      setSession(await api.auth.removePhone(password));
      setPassword('');
      setNotice(t('dashboard.security.phoneRemoved'));
    });
  };

  const alerts = (
    <>
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
    </>
  );

  return (
    <>
      <Card padding="lg" className="settings__card" data-testid="phone-card">
        <h2><Icon name="phone" size={18} /> {t('dashboard.security.phoneTitle')}</h2>
        {alerts}
        {step === 'idle' && (
          <>
            {phone ? (
              <p className="settings__status">
                <Badge tone={user.phoneVerified ? 'success' : 'warning'} dot>{user.phoneVerified ? t('dashboard.settings.verified') : t('dashboard.settings.unverified')}</Badge>
                <span className="muted">{formatInternational(phone)}</span>
              </p>
            ) : (
              <p className="muted">{t('dashboard.security.phoneNone')}</p>
            )}
            {!smsAvailable && <Alert tone="warning">{t('auth.phone.errors.unavailable')}</Alert>}
            <Button variant="secondary" size="sm" iconLeft="phone" disabled={!smsAvailable} onClick={() => { setStep('phone'); setError(null); setNotice(null); }}>
              {phone ? t('dashboard.security.phoneChange') : t('dashboard.security.phoneAdd')}
            </Button>
          </>
        )}
        {step === 'phone' && (
          <form onSubmit={sendCode} noValidate className="auth-form">
            <PhoneField dial={dial} national={national} onDial={setDial} onNational={setNational} error={fieldError} />
            <div className="auth-form__split">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep('idle')}>{t('common.cancel')}</Button>
              <Button type="submit" variant="gradient" size="sm" loading={busy} iconLeft="send">{t('auth.phone.send')}</Button>
            </div>
          </form>
        )}
        {step === 'code' && (
          <form onSubmit={verify} noValidate className="auth-form">
            <p className="muted">{t('auth.phone.codeHint', { channel: t(`auth.phone.channels.${otp?.channel ?? 'sms'}`), phone: formatInternational(e164) })}</p>
            {otp?.devCode && (
              <Alert tone="warning" title={t('auth.dev.title')} action={<Button size="sm" variant="secondary" onClick={() => setCode(otp.devCode!)}>{t('auth.phone.dev.fill')}</Button>}>
                {t('auth.phone.dev.text')} <strong className="mono">{otp.devCode}</strong>
              </Alert>
            )}
            <Input
              label={t('auth.phone.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} error={fieldError}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} className="otp-input" required
            />
            <div className="auth-form__split">
              <Button type="button" variant="ghost" size="sm" iconLeft="refresh" disabled={cooldown > 0 || busy} onClick={() => sendCode()}>
                {cooldown > 0 ? t('auth.phone.resendIn', { s: cooldown }) : t('auth.phone.resend')}
              </Button>
              <Button type="submit" variant="gradient" size="sm" loading={busy} disabled={code.length !== 6}>{t('auth.phone.verify')}</Button>
            </div>
          </form>
        )}
      </Card>

      <Card padding="lg" className="settings__card" data-testid="two-factor-card">
        <h2><Icon name="fingerprint" size={18} /> {t('dashboard.security.twoFactorTitle')}</h2>
        <p className="muted">{t('dashboard.security.twoFactorText')}</p>
        <p className="settings__status">
          <Badge tone={user.twoFactorSms ? 'success' : 'neutral'} dot>{user.twoFactorSms ? t('dashboard.security.twoFactorActive') : t('dashboard.security.twoFactorInactive')}</Badge>
        </p>
        {!hasPassword ? (
          <p className="subtle">{t('dashboard.security.twoFactorPhoneOnly')}</p>
        ) : !user.phoneVerified ? (
          <p className="subtle">{t('dashboard.security.twoFactorNeedsPhone')}</p>
        ) : (
          <>
            <PasswordInput label={t('dashboard.security.confirmWithPassword')} name="current-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError} />
            <div className="auth-form__split">
              <Button
                variant={user.twoFactorSms ? 'secondary' : 'gradient'} size="sm" loading={busy}
                onClick={() => toggleTwoFactor(!user.twoFactorSms)}
              >
                {user.twoFactorSms ? t('dashboard.security.twoFactorDisable') : t('dashboard.security.twoFactorEnable')}
              </Button>
              {phone && <Button variant="ghost" size="sm" disabled={busy} onClick={removePhone}>{t('dashboard.security.phoneRemove')}</Button>}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
