import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, ConfirmDialog, Icon, Input, useToast } from '@/components/ui';
import { QrCode } from '@/features/page-engine/blocks/render/places';
import { explainOtpError } from '@/features/authentication/otpErrors';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import type { MfaStatus, TotpSetup } from '@/models/auth';
import { useSession } from '@/state/session';
import { downloadBlob } from '@/utilities/share';
import { useIdentity } from './IdentityField';

type Method = 'sms' | 'email' | 'totp';

/**
 * Vérification en deux étapes : SMS, e-mail, application d'authentification. Tout est désactivé par défaut ; chaque changement
 * exige une preuve d'identité (mot de passe ou code). Le serveur reste l'autorité : l'interface ne fait que refléter son état.
 */
export function MfaCard() {
  const t = useT('dashboard', 'auth', 'common');
  const toast = useToast();
  const setSession = useSession((s) => s.setSession);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [pending, setPending] = useState<{ method: Method; enable: boolean } | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [regen, setRegen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const identity = useIdentity();

  const reload = useCallback(() => void api.auth.getMfa().then(setStatus, () => undefined), []);
  // L'état se rafraîchit aussi quand le numéro ou l'adresse du compte changent (carte « Numéro de téléphone »).
  const phoneVerified = useSession((s) => s.session?.user.phoneVerified);
  const emailVerified = useSession((s) => s.session?.user.emailVerified);
  useEffect(reload, [reload, phoneVerified, emailVerified]);

  const close = () => { setPending(null); setRegen(false); setError(null); identity.reset(); };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (regen) {
        setCodes(await api.auth.regenerateRecoveryCodes(identity.proof));
        close();
        reload();
        return;
      }
      if (!pending) return;
      const { method, enable } = pending;
      if (method === 'totp' && enable) {
        setSetup(await api.auth.setupTotp(identity.proof));
        setTotpCode('');
        close();
        return;
      }
      const session = method === 'sms' ? await api.auth.setSmsMfa(enable, identity.proof)
        : method === 'email' ? await api.auth.setEmailMfa(enable, identity.proof)
          : await api.auth.disableTotp(identity.proof);
      setSession(session);
      toast.push({ tone: 'success', title: enable ? t('dashboard.security.mfa.toggled.on') : t('dashboard.security.mfa.toggled.off') });
      close();
      reload();
    } catch (e) {
      setError(isApiError(e) && e.message === 'phone_required' ? t('dashboard.security.mfa.sms.needsPhone') : explainOtpError(t, e));
    } finally {
      setBusy(false);
    }
  };

  const finishSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.enableTotp(totpCode);
      setSession(res.session);
      setCodes(res.recoveryCodes);
      setSetup(null);
      reload();
    } catch (e) {
      setError(isApiError(e) && e.message === 'invalid_code' ? t('dashboard.security.mfa.setup.invalid') : explainOtpError(t, e));
    } finally {
      setBusy(false);
    }
  };

  const rows: { method: Method; icon: 'phone' | 'mail' | 'fingerprint'; enabled: boolean; hint?: string; blocked: boolean }[] = status ? [
    { method: 'sms', icon: 'phone', enabled: status.sms.enabled, blocked: !status.sms.phoneVerified && !status.sms.enabled, hint: !status.sms.phoneVerified ? t('dashboard.security.mfa.sms.needsPhone') : undefined },
    { method: 'email', icon: 'mail', enabled: status.email.enabled, blocked: !status.email.available && !status.email.enabled, hint: !status.email.available ? t('dashboard.security.mfa.email.unavailable') : undefined },
    { method: 'totp', icon: 'fingerprint', enabled: status.totp.enabled, blocked: false },
  ] : [];

  return (
    <Card padding="lg" className="settings__card" data-testid="mfa-card">
      <h2><Icon name="shield" size={18} /> {t('dashboard.security.mfa.title')}</h2>
      <p className="muted">{t('dashboard.security.mfa.text')}</p>

      <ul role="list" className="mfa-list">
        {rows.map((r) => (
          <li key={r.method} className="mfa-item" data-method={r.method}>
            <span className="mfa-item__icon"><Icon name={r.icon} size={18} /></span>
            <div className="mfa-item__text">
              <strong>{t(`dashboard.security.mfa.${r.method}.title`)}</strong>
              <small>{t(`dashboard.security.mfa.${r.method}.text`)}</small>
              {r.hint && <small className="subtle">{r.hint}</small>}
            </div>
            <Badge tone={r.enabled ? 'success' : 'neutral'} dot>{r.enabled ? t('dashboard.security.mfa.active') : t('dashboard.security.mfa.inactive')}</Badge>
            <Button size="sm" variant={r.enabled ? 'secondary' : 'gradient'} disabled={r.blocked || busy} onClick={() => { setPending({ method: r.method, enable: !r.enabled }); setError(null); }}>
              {r.enabled ? t('dashboard.security.mfa.disable') : t('dashboard.security.mfa.enable')}
            </Button>
          </li>
        ))}
      </ul>

      {status?.totp.enabled && !codes && (
        <p className="settings__status">
          <span className="muted">{t('dashboard.security.mfa.recovery.left', { count: status.recoveryLeft })}</span>
          <Button size="sm" variant="ghost" onClick={() => { setRegen(true); setError(null); }}>{t('dashboard.security.mfa.recovery.regenerate')}</Button>
        </p>
      )}

      {setup && (
        <div className="mfa-setup" role="group" aria-label={t('dashboard.security.mfa.setup.title')}>
          <h3>{t('dashboard.security.mfa.setup.title')}</h3>
          <p className="muted">{t('dashboard.security.mfa.setup.step1')}</p>
          <div className="mfa-setup__qr"><QrCode value={setup.uri} size={168} label={t('dashboard.security.mfa.setup.title')} /></div>
          <p className="muted"><small>{t('dashboard.security.mfa.setup.key')}</small><br /><code className="mono mfa-setup__key">{setup.secret}</code></p>
          <p className="muted">{t('dashboard.security.mfa.setup.step2')}</p>
          {error && <Alert tone="danger">{error}</Alert>}
          <Input label={t('auth.phone.code')} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="otp-input" />
          <div className="auth-form__split">
            <Button variant="ghost" size="sm" onClick={() => { setSetup(null); setError(null); }}>{t('dashboard.security.mfa.setup.cancel')}</Button>
            <Button variant="gradient" size="sm" loading={busy} disabled={totpCode.length !== 6} onClick={() => void finishSetup()}>{t('dashboard.security.mfa.setup.verify')}</Button>
          </div>
        </div>
      )}

      {codes && (
        <div className="mfa-codes" role="group" aria-label={t('dashboard.security.mfa.recovery.title')}>
          <h3>{t('dashboard.security.mfa.recovery.title')}</h3>
          <Alert tone="warning">{t('dashboard.security.mfa.recovery.text')}</Alert>
          <ul role="list" className="mfa-codes__list">{codes.map((c) => <li key={c} className="mono">{c}</li>)}</ul>
          <div className="auth-form__split">
            <Button size="sm" variant="secondary" iconLeft="copy" onClick={() => void navigator.clipboard?.writeText(codes.join('\n')).then(() => toast.push({ tone: 'success', title: t('dashboard.security.mfa.recovery.copied') }), () => undefined)}>{t('dashboard.security.mfa.recovery.copy')}</Button>
            <Button size="sm" variant="secondary" iconLeft="download" onClick={() => downloadBlob(new Blob([`1Link — ${t('dashboard.security.mfa.recovery.title')}\n\n${codes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' }), '1link-codes-de-secours.txt')}>{t('dashboard.security.mfa.recovery.download')}</Button>
            <Button size="sm" variant="gradient" onClick={() => setCodes(null)}>{t('dashboard.security.mfa.recovery.saved')}</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null || regen} loading={busy} onCancel={close} onConfirm={() => void confirm()} confirmDisabled={!identity.ready}
        title={regen ? t('dashboard.security.mfa.recovery.regenerate') : t(`dashboard.security.mfa.confirmTitle.${pending?.enable ? 'enable' : 'disable'}`)}
        description={regen ? t('dashboard.security.mfa.recovery.regenerateText') : pending ? t(`dashboard.security.mfa.${pending.method}.title`) : undefined}
        confirmLabel={regen ? t('dashboard.security.mfa.recovery.regenerate') : pending?.enable ? t('dashboard.security.mfa.enable') : t('dashboard.security.mfa.disable')}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        {identity.field}
      </ConfirmDialog>
    </Card>
  );
}
