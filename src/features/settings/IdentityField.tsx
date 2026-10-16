import { useState, type ReactNode } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import type { CodeSent, IdentityProof } from '@/models/auth';
import { useSession } from '@/state/session';
import { maskEmail } from '@/utilities/validation';
import { PasswordInput } from '@/features/authentication/parts';
import { explainOtpError } from '@/features/authentication/otpErrors';

export interface IdentityControl {
  /** Preuve prête à envoyer au serveur. */
  proof: IdentityProof;
  /** La saisie est complète (mot de passe renseigné, ou code à 6 chiffres). */
  ready: boolean;
  reset(): void;
  /** Champ à afficher : mot de passe, ou bouton d'envoi de code puis saisie du code. */
  field: ReactNode;
}

/**
 * Preuve d'identité avant une opération sensible : mot de passe, ou — pour un compte créé par code, sans mot de passe —
 * un code envoyé à l'adresse e-mail du compte (à défaut, au téléphone vérifié).
 */
export function useIdentity(): IdentityControl {
  const t = useT('dashboard', 'auth', 'common');
  const user = useSession((s) => s.session?.user);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<(CodeSent & { via: 'email' | 'sms' }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasPassword = Boolean(user?.hasPassword);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      setSent(await api.auth.requestIdentityCode());
    } catch (e) {
      setError(explainOtpError(t, e));
    } finally {
      setBusy(false);
    }
  };

  const field = hasPassword ? (
    <PasswordInput label={t('dashboard.security.identity.password')} name="confirm-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus="" />
  ) : (
    <div className="identity">
      {error && <Alert tone="danger">{error}</Alert>}
      {!sent ? (
        <Button variant="secondary" loading={busy} iconLeft="send" onClick={() => void send()}>
          {t('dashboard.security.identity.sendCode', { contact: user?.email ? maskEmail(user.email) : user?.phone ?? '' })}
        </Button>
      ) : (
        <>
          <p className="muted">{t('dashboard.security.identity.codeSent')}</p>
          {sent.devCode && <Alert tone="warning" title={t('auth.dev.title')} action={<Button size="sm" variant="secondary" onClick={() => setCode(sent.devCode!)}>{t('auth.phone.dev.fill')}</Button>}>{t('auth.emailCode.dev')} <strong className="mono">{sent.devCode}</strong></Alert>}
          <Input label={t('dashboard.security.identity.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="otp-input" data-autofocus="" />
        </>
      )}
    </div>
  );

  return {
    proof: hasPassword ? { password } : { code },
    ready: hasPassword ? password.length > 0 : code.length === 6,
    reset: () => { setPassword(''); setCode(''); setSent(null); setError(null); },
    field,
  };
}
