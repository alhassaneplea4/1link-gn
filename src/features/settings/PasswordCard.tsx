import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, ConfirmDialog, Icon } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { PasswordInput, passwordStrength } from '@/features/authentication/parts';
import { explainOtpError } from '@/features/authentication/otpErrors';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { useSession } from '@/state/session';
import { useIdentity } from './IdentityField';

/** Définit (compte créé par code) ou modifie le mot de passe, après confirmation d'identité. */
export function PasswordCard() {
  const t = useT('dashboard', 'auth', 'common');
  const user = useSession((s) => s.session?.user);
  const setSession = useSession((s) => s.setSession);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const identity = useIdentity();
  if (!user) return null;
  const has = user.hasPassword;
  const close = () => { setOpen(false); setValue(''); setError(null); identity.reset(); };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      setSession(await api.auth.setPassword(value, identity.proof));
      setNotice(t('dashboard.security.password.done'));
      close();
    } catch (e) {
      setError(explainOtpError(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg" className="settings__card">
      <h2><Icon name="key" size={18} /> {t('dashboard.security.passwordTitle')}</h2>
      {!has && <p className="muted">{t('dashboard.security.password.setText')}</p>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Button variant="secondary" onClick={() => { setOpen(true); setNotice(null); }}>{has ? t('dashboard.security.password.change') : t('dashboard.security.password.open')}</Button>
      {has && <Link to={paths.forgotPassword} className="subtle">{t('auth.login.forgot')}</Link>}
      <ConfirmDialog
        open={open} loading={busy} onCancel={close} onConfirm={() => void save()} confirmDisabled={!identity.ready || value.length < 8}
        title={has ? t('dashboard.security.password.changeTitle') : t('dashboard.security.password.setTitle')} confirmLabel={t('dashboard.security.password.set')}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <PasswordInput label={t('dashboard.security.password.new')} name="new-password" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} hint={t('auth.register.passwordHint')} />
        {value && <p className="subtle" aria-live="polite">{t('auth.register.strength.label')} : {t(passwordStrength(value) === 3 ? 'auth.register.strength.strong' : passwordStrength(value) === 2 ? 'auth.register.strength.fair' : 'auth.register.strength.weak')}</p>}
        {identity.field}
      </ConfirmDialog>
    </Card>
  );
}
