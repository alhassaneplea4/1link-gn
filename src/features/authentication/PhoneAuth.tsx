import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Checkbox, Icon, Input, RadioGroup, Radio, Select } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { api } from '@/services/api';
import { intlLocale, useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import type { OtpChannel, OtpRequestResult, Session } from '@/models/auth';
import { COUNTRIES, DEFAULT_DIAL, countryName, maskPhone, normalizePhone } from '@/utilities/phone';
import { useSession } from '@/state/session';

interface Props {
  mode: 'sign_in' | 'sign_up';
  onDone: (session: Session) => void;
}

type Step = 'phone' | 'code';

/**
 * Connexion / inscription par numéro de téléphone : code à usage unique reçu sur WhatsApp ou par SMS.
 * L'interface ne révèle jamais si un numéro a un compte avant la preuve de possession (code correct).
 */
export function PhoneAuth({ mode, onDone }: Props) {
  const t = useT('auth', 'common');
  const setSession = useSession((s) => s.setSession);
  const [step, setStep] = useState<Step>('phone');
  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [national, setNational] = useState('');
  const [channel, setChannel] = useState<OtpChannel>('whatsapp');
  // Canaux réellement disponibles côté serveur (inconnu pendant le chargement : on propose les deux).
  const [channels, setChannels] = useState<OtpChannel[] | null>(null);

  useEffect(() => {
    let live = true;
    api.auth.getCapabilities().then(
      (caps) => {
        if (!live) return;
        setChannels(caps.otpChannels);
        setChannel((cur) => (caps.otpChannels.includes(cur) ? cur : (caps.otpChannels[0] ?? cur)));
      },
      () => undefined,
    );
    return () => { live = false; };
  }, []);
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState('');
  const [e164, setE164] = useState('');
  const [otp, setOtp] = useState<OtpRequestResult | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [errors, setErrors] = useState<{ phone?: string; name?: string; terms?: string; code?: string }>({});
  const [formError, setFormError] = useState<{ text: string; action?: 'register' | 'login' } | null>(null);
  const [busy, setBusy] = useState(false);
  const locale = intlLocale();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const explain = (e: unknown): { text: string; action?: 'register' | 'login' } => {
    if (!isApiError(e)) return { text: t('auth.phone.errors.generic') };
    const msg = e.message;
    const num = (k: string) => Number(e.fields?.[k] ?? 0);
    if (e.code === 'network') return { text: t('auth.errors.network') };
    if (msg === 'invalid_code') return { text: t('auth.phone.errors.invalidCode', { count: num('attemptsLeft') }) };
    if (msg === 'code_expired' || msg === 'expired') return { text: t('auth.phone.errors.expired') };
    if (msg === 'too_many_attempts') return { text: t('auth.phone.errors.tooManyAttempts') };
    if (msg === 'resend_too_soon') return { text: t('auth.phone.errors.resendTooSoon', { s: num('retryAfterSec') }) };
    if (msg === 'too_many_requests') return { text: t('auth.phone.errors.tooManyRequests', { min: Math.ceil(num('retryAfterSec') / 60) }) };
    if (msg === 'no_account') return { text: t('auth.phone.errors.noAccount'), action: 'register' };
    if (msg === 'phone_taken') return { text: t('auth.phone.errors.phoneTaken'), action: 'login' };
    if (msg === 'account_suspended') return { text: t('auth.errors.suspended') };
    if (msg === 'otp_unavailable') return { text: t('auth.phone.errors.unavailable') };
    if (msg === 'country_not_supported') return { text: t('auth.phone.errors.country') };
    return { text: t('auth.phone.errors.generic') };
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const found: typeof errors = {};
    const normalized = normalizePhone(national, dial);
    if (!normalized) found.phone = t('auth.phone.errors.invalidPhone');
    if (mode === 'sign_up') {
      if (!name.trim()) found.name = t('common.validation.required');
      if (!terms) found.terms = t('auth.errors.termsRequired');
    }
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length || !normalized) return;
    setBusy(true);
    try {
      const res = await api.auth.requestOtp({ phone: normalized, channel });
      setE164(normalized);
      setOtp(res);
      setCooldown(res.resendInSec);
      setCode('');
      setStep('code');
    } catch (err) {
      setFormError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) return setErrors({ code: t('auth.phone.errors.codeFormat') });
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      const session = await api.auth.verifyOtp({ phone: e164, code, mode, name: name.trim() || undefined, acceptTerms: terms });
      setSession(session);
      onDone(session);
    } catch (err) {
      const x = explain(err);
      setFormError(x);
      if (isApiError(err) && (err.message === 'too_many_attempts' || err.message === 'expired' || err.message === 'code_expired')) setCode('');
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const res = await api.auth.requestOtp({ phone: e164, channel });
      setOtp(res);
      setCooldown(res.resendInSec);
      setCode('');
    } catch (err) {
      setFormError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const alert = formError && (
    <Alert tone="danger" action={formError.action ? <Link className="btn btn--secondary btn--sm" to={formError.action === 'register' ? paths.register : paths.login}><span className="btn__label">{formError.action === 'register' ? t('auth.login.register') : t('auth.register.login')}</span></Link> : undefined}>
      {formError.text}
    </Alert>
  );

  if (step === 'code') {
    return (
      <form onSubmit={(e) => void verify(e)} noValidate className="auth-form" aria-label={t('auth.phone.verifyTitle')}>
        <p className="muted">{t('auth.phone.codeHint', { channel: t(`auth.phone.channels.${otp?.channel ?? channel}`), phone: maskPhone(e164) })}</p>
        {otp?.devCode && (
          <Alert tone="warning" title={t('auth.dev.title')} action={<Button size="sm" variant="secondary" onClick={() => setCode(otp.devCode!)}>{t('auth.phone.dev.fill')}</Button>}>
            {t('auth.phone.dev.text')} <strong className="mono" aria-label={t('auth.phone.dev.codeLabel')}>{otp.devCode}</strong>
          </Alert>
        )}
        {alert}
        <Input
          label={t('auth.phone.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} error={errors.code}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} className="otp-input" required data-autofocus=""
        />
        <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy} disabled={code.length !== 6}>{t('auth.phone.verify')}</Button>
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
      {alert}
      {mode === 'sign_up' && <Input label={t('auth.fields.name')} name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />}
      <div className="phonefield">
        <Select label={t('auth.phone.country')} value={dial} onChange={(e) => setDial(e.target.value)} wrapperClassName="phonefield__country">
          {COUNTRIES.map((c) => <option key={c.region} value={c.dial}>{countryName(c.region, locale)} (+{c.dial})</option>)}
        </Select>
        <Input label={t('auth.phone.number')} type="tel" name="tel-national" inputMode="tel" autoComplete="tel-national" placeholder="6XX XX XX XX" value={national} onChange={(e) => setNational(e.target.value)} error={errors.phone} hint={t('auth.phone.numberHint')} required prefix={`+${dial}`} />
      </div>
      {channels && channels.length === 0 && <Alert tone="warning">{t('auth.phone.errors.unavailable')}</Alert>}
      {(!channels || channels.length > 1) && (
        <RadioGroup legend={t('auth.phone.channel')} name={`otp-channel-${mode}`} value={channel} onChange={(v) => setChannel(v as OtpChannel)} inline>
          <Radio value="whatsapp" label={t('auth.phone.channels.whatsapp')} />
          <Radio value="sms" label={t('auth.phone.channels.sms')} />
        </RadioGroup>
      )}
      {mode === 'sign_up' && <Checkbox label={t('auth.register.terms')} checked={terms} onChange={(e) => setTerms(e.target.checked)} error={errors.terms} />}
      <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy} disabled={channels?.length === 0} iconLeft="send">{t('auth.phone.send')}</Button>
      <p className="subtle auth-form__note"><Icon name="info" size={13} /> {t('auth.phone.privacy')}</p>
    </form>
  );
}
